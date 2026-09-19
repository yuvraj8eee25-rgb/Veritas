# Multiplayer setup

Files that power multiplayer:

| File | Purpose |
|---|---|
| `supabase-config.js` | Supabase client init + email/password auth |
| `multiplayer.js` | Lobby, hot topics, matchmaking, debate room |
| `supabase/migrations/0001_init.sql` | Tables, Row Level Security, matching/turn RPC functions, realtime |
| `supabase/functions/generate-hot-topics/` | Edge Function: asks Gemini for daily topics |
| `supabase/functions/cleanup-stale-queue/` | Edge Function: sweeps abandoned queue entries |
| `supabase/functions/cleanup-stale-debates/` | Edge Function: ends debates abandoned mid-match |
| `supabase/migrations/0003_stale_debate_cleanup.sql` | Adds `last_turn_at` + wires the DB/cron to end stale debates |
| `supabase/functions/ai-referee/` | Edge Function: asks Gemini to judge a completed debate |
| `supabase/migrations/0002_ai_referee.sql` | Adds `ai_verdict`/`ai_scored_at` columns + wires the DB to call `ai-referee` on completion |

`index.html`, `styles.css`, and `app.js` were edited in place (a "Multiplayer"
icon in the top bar + a battle card on Home, two new screens, and a small
`window.DA` bridge at the end of `app.js` so `multiplayer.js` can reuse
`toast`, `showScreen`, and award XP).

## 1. Create the Supabase project

1. https://supabase.com/dashboard → **New project**.
2. Project Settings → **API** → copy the **Project URL** and **anon public
   key** into `supabase-config.js` (replace the `YOUR-...` placeholders).
3. **Authentication** → **Providers** → enable **Email**. (This app now
   uses real email/password accounts, not anonymous sign-ins — the auth
   screen in `index.html` calls `signUp`/`signInWithPassword` directly.)

## 2. Run the database migration

Using the Supabase CLI (recommended):

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase db push
```

Or just paste the contents of `supabase/migrations/0001_init.sql` into
Dashboard → **SQL Editor** and run it. It creates the `hot_topics`,
`match_queue`, and `debates` tables, turns on Row Level Security, adds the
`attempt_match` / `submit_turn` / `submit_timeout_turn` / `submit_rating`
functions the client calls, and adds `match_queue` + `debates` to the
`supabase_realtime` publication (so live updates work without any extra
config).

## 3. Deploy the automation (Edge Functions)

```bash
supabase functions deploy generate-hot-topics --no-verify-jwt
supabase functions deploy cleanup-stale-queue --no-verify-jwt
supabase functions deploy cleanup-stale-debates --no-verify-jwt
supabase secrets set GEMINI_API_KEY=your-gemini-key NEWSAPI_KEY=your-newsapi-key CRON_SECRET=some-random-string
```

`NEWSAPI_KEY` is a free key from [newsapi.org](https://newsapi.org). It's optional —
if it's missing or a request to NewsAPI fails, `generate-hot-topics` automatically falls
back to letting Gemini invent topics on its own (the original behavior), so the lobby
never breaks because of a news-API hiccup.

`--no-verify-jwt` is needed because these two functions are called by a
scheduled job, not by a signed-in user — they check the `x-cron-secret`
header themselves instead.

Then schedule them: uncomment the bottom section of
`supabase/migrations/0001_init.sql` (enables `pg_cron` + `pg_net`), fill in
your project ref and the same `CRON_SECRET` you set above, and run it (SQL
Editor or another `supabase db push`). That's the automation:

1. `generate-hot-topics` runs daily at 05:00 UTC. It first pulls today's
   top headlines from NewsAPI.org across a few categories (tech, business,
   science, health), then asks Gemini to turn 6 of the more debate-worthy
   ones into one-sentence claims, tagging each with the source headline's
   URL and publisher. The client shows a small "LIVE" badge and an
   "Inspired by <publisher>" link on any topic grounded in a real story.
   If NewsAPI is unavailable, it falls back to Gemini generating topics
   from its own knowledge, same as before — the row still gets written,
   just without the news attribution.
2. The app just reads that day's row — no function call happens at read
   time, so the lobby loads instantly.
3. `cleanup-stale-queue` runs every 5 minutes and deletes queue entries
   older than 5 minutes, so someone who searched and closed the tab
   doesn't stay "waiting" forever and get matched hours later.
4. `cleanup-stale-debates` runs every 5 minutes and ends any `active`
   debate that's gone 10+ minutes without a turn, so someone whose
   opponent closed the tab mid-debate doesn't stay stuck on
   "Opponent's turn" forever — see "Stale-tab handling" below.

To generate today's topics immediately instead of waiting for the
schedule:

```bash
curl -X POST https://YOUR-PROJECT-REF.supabase.co/functions/v1/generate-hot-topics \
  -H "x-cron-secret: some-random-string"
```

A static 6-topic fallback list is baked into `multiplayer.js` too, so the
lobby never looks empty even before the first run or if a day's generation
fails.

## 4. Serve the app

Supabase doesn't host static files — deploy `index.html` and friends to any
static host you like (Vercel, Netlify, GitHub Pages, Cloudflare Pages,
etc.) as long as `supabase-config.js` points at the right project.

## How matchmaking works (no server round-trip needed)

- Tapping **Find Match** upserts a `match_queue` row with the chosen topic
  (or none) and subscribes to realtime updates on that same row.
- Every few seconds, the client calls the `attempt_match()` Postgres
  function, which atomically finds the oldest other `waiting` row (using
  `FOR UPDATE SKIP LOCKED` so two clients racing for the same opponent
  just resolve cleanly instead of retrying), creates the `debates` room,
  and flips both queue rows to `matched` — each client learns about it
  through its own row's realtime subscription.
- Because the matching logic runs inside a single Postgres function call,
  there's no retry loop to write client-side (Postgres's row locking
  replaces what Firestore needed a transaction-with-retries for).

This keeps the whole thing serverless. For a larger app you'd eventually
want matching to happen inside an Edge Function instead of the client (so
you can rate-limit, prevent abuse, and match on skill/rank) — swap the
client's `attemptMatch()` call for an HTTP call to a new Edge Function that
does the same `attempt_match()` RPC call server-side.

## Debate flow

- Turn-based, 3 arguments per player (`maxTurnsPerPlayer` in
  `multiplayer.js` — change the constant to adjust).
- Turn order = whoever was waiting first goes first.
- All state lives in one `debates` row; both clients subscribe to realtime
  `postgres_changes` updates on it, so turns appear live with no polling.
- Turns and ratings are written through `submit_turn` / `submit_timeout_turn`
  / `submit_rating` Postgres functions rather than direct table updates —
  they re-check whose turn it is, valid turn shape, and rating timing
  server-side, the same checks the old Firestore security rules made.
- On completion, each player can thumbs up/down the other's argument and
  gets +60 XP locally.

## 5. AI referee (Gemini)

The end-of-debate "AI Referee verdict" is judged by Gemini — the same
free-tier key/model already set up for `generate-hot-topics` — instead of
the old word-count heuristic. Setup:

```bash
supabase functions deploy ai-referee --no-verify-jwt
supabase secrets set AI_REFEREE_SECRET=some-other-random-string
```

You don't need a new API key — `ai-referee` reuses the `GEMINI_API_KEY`
secret you already set in step 3. `AI_REFEREE_SECRET` is a new one, any
random string, just for this function.

`--no-verify-jwt` is needed for the same reason as the other two functions:
`ai-referee` isn't called by a signed-in user, it's called by Postgres
itself — it checks the `x-referee-secret` header instead.

Then run `supabase/migrations/0002_ai_referee.sql` (fill in your project ref
and the `AI_REFEREE_SECRET` you just set at the top of `notify_ai_referee()`
first, and make sure `pg_net` is enabled — same extension used for the
`generate-hot-topics` / `cleanup-stale-queue` schedules). This migration:

1. Adds `ai_verdict jsonb` and `ai_scored_at timestamptz` columns to `debates`.
2. Updates `submit_turn()` and `submit_timeout_turn()` so that, in the same
   transaction that flips a debate's `status` to `'completed'`, Postgres
   itself fires an async HTTP call to `ai-referee` via `pg_net`. This is
   deliberately **not** triggered by the client — it means the debate still
   gets scored even if the player who submits the last turn (or times out)
   closes the tab immediately after. A `pg_net` failure is caught and
   logged, never blocks the turn submission itself.

`ai-referee` reads the finished debate's transcript, asks Gemini for a
structured verdict (per-player score, a short summary, and per-turn
feedback), and writes it back to `ai_verdict` — idempotently, so a retried
or duplicate trigger is a no-op once it's already scored.

## 6. Solo "Debate the AI" mode

This is a separate feature from live multiplayer — the player argues
against a Gemini-generated opponent instead of another human, with no
`debates` table row involved at all (everything is synchronous
request/response). It needs its own Edge Function deploy, which earlier
versions of this doc didn't mention:

```bash
supabase functions deploy ai-debate
```

Note this one has **no** `--no-verify-jwt` flag, unlike the three
functions above. That's intentional, not an oversight: `ai-debate` is
called directly by the signed-in player's browser (`ai-debate.js` via
`supabase.functions.invoke("ai-debate", ...)`), which automatically
attaches that player's own session JWT — so leaving JWT verification on
is what actually restricts this function to real, signed-in accounts.
The other three functions are called by Postgres/cron with no user
session at all, which is why they need `--no-verify-jwt` plus their own
shared-secret header (`x-cron-secret` / `x-referee-secret`) instead.

No new secret is needed — it reuses `GEMINI_API_KEY` from step 3.

On the client, `getRefereeVerdict()` in `multiplayer.js` shows the old
heuristic score **immediately** when the end-of-debate panel opens (labeled
as still-pending), then silently upgrades to the real Gemini verdict once
`ai_verdict` lands — no extra polling needed, since the client is already
subscribed to `postgres_changes` updates on the `debates` row. If the
Gemini call fails entirely, the heuristic estimate is what stays on screen,
so a broken AI call never blocks the end-of-debate screen.

To manually score (or re-check) a specific debate:

```bash
curl -X POST https://YOUR-PROJECT-REF.supabase.co/functions/v1/ai-referee \
  -H "Content-Type: application/json" \
  -H "x-referee-secret: some-other-random-string" \
  -d '{"debate_id": "the-debate-uuid"}'
```

## Stale-tab handling

The 30-second per-turn timer (`beginTurnTimer()` in `multiplayer.js`) that
auto-passes a slow turn only runs in the browser of whoever currently owns
the turn. If that player closes their tab instead of waiting it out, no
browser is left to fire `submit_timeout_turn()` — so nothing ever advances
the debate, and the opponent is stuck on "Opponent's turn" with no timeout
in sight.

Fixed the same way `cleanup-stale-queue` handles abandoned matchmaking:
a `last_turn_at` column on `debates` (stamped by `submit_turn()` and
`submit_timeout_turn()` on every turn) plus a Postgres function,
`expire_stale_debates()`, that flips any `active` debate with no turn in
the last 10 minutes to `completed` and fires the usual AI-referee
notification on whatever transcript exists. The `cleanup-stale-debates`
Edge Function calls it every 5 minutes via `pg_cron`, the same schedule as
`cleanup-stale-queue`. Because the client already treats any
`status !== "active"` as "debate over" and shows the end panel, no
front-end change was needed — the stuck opponent's screen resolves itself
on the next realtime update to the row.
