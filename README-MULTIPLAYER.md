# Multiplayer setup

Files that power multiplayer:

| File | Purpose |
|---|---|
| `supabase-config.js` | Supabase client init + anonymous sign-in |
| `multiplayer.js` | Lobby, hot topics, matchmaking, debate room |
| `supabase/migrations/0001_init.sql` | Tables, Row Level Security, matching/turn RPC functions, realtime |
| `supabase/functions/generate-hot-topics/` | Edge Function: asks Gemini for daily topics |
| `supabase/functions/cleanup-stale-queue/` | Edge Function: sweeps abandoned queue entries |

`index.html`, `styles.css`, and `app.js` were edited in place (a "Multiplayer"
icon in the top bar + a battle card on Home, two new screens, and a small
`window.DA` bridge at the end of `app.js` so `multiplayer.js` can reuse
`toast`, `showScreen`, and award XP).

## 1. Create the Supabase project

1. https://supabase.com/dashboard → **New project**.
2. Project Settings → **API** → copy the **Project URL** and **anon public
   key** into `supabase-config.js` (replace the `YOUR-...` placeholders).
3. **Authentication** → **Providers** → enable **Anonymous sign-ins**.

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
supabase secrets set GEMINI_API_KEY=your-gemini-key CRON_SECRET=some-random-string
```

`--no-verify-jwt` is needed because these two functions are called by a
scheduled job, not by a signed-in user — they check the `x-cron-secret`
header themselves instead.

Then schedule them: uncomment the bottom section of
`supabase/migrations/0001_init.sql` (enables `pg_cron` + `pg_net`), fill in
your project ref and the same `CRON_SECRET` you set above, and run it (SQL
Editor or another `supabase db push`). That's the automation:

1. `generate-hot-topics` runs daily at 05:00 UTC. It asks Gemini for 6
   current, debate-worthy topics as JSON and writes them to `hot_topics`
   for today's date.
2. The app just reads that day's row — no function call happens at read
   time, so the lobby loads instantly.
3. `cleanup-stale-queue` runs every 5 minutes and deletes queue entries
   older than 5 minutes, so someone who searched and closed the tab
   doesn't stay "waiting" forever and get matched hours later.

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

## Known limitation

If a player closes the tab mid-debate, their opponent is left waiting on
"Opponent's turn" with nothing timing them out. A quick v2 addition: store
a `last_turn_at` column on `debates` and add a scheduled Edge Function
(like `cleanup-stale-queue`) that marks debates `status = 'completed'` (or
`'abandoned'`) if no turn has landed in, say, 10 minutes — the client
already handles any `status !== "active"` by showing the end panel, so no
front-end change would be needed.
