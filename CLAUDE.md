# Veritas — AI Debate Coach (PROTOTYPE)

## What this is
A browser-based critical-thinking / debate-practice app. Vanilla HTML/CSS/
JS frontend (no framework, no build step, no npm) talking directly to
Supabase (Postgres + Auth + Realtime + Edge Functions), which calls
Google Gemini and NewsAPI.org. Solo practice modes are 100% local
(localStorage); live multiplayer and solo "Debate the AI" are the only
backend-dependent features.

## Stack
- Frontend: plain HTML5, vanilla ES6+ JS (3 files: app.js, multiplayer.js,
  ai-debate.js, each an IIFE), hand-written CSS with custom-property
  tokens. No React/Vue, no bundler, no TypeScript on the client.
- Backend: Supabase — Postgres w/ Row Level Security + SECURITY DEFINER
  RPC functions, email/password Auth (real accounts, gated login/signup
  screen), Realtime (postgres_changes), 5 Deno Edge Functions, pg_cron +
  pg_net for scheduling.
- AI: Google Gemini (gemini-3.1-flash-lite, raw REST, no SDK) for topic
  generation, opponent turns, and referee scoring. NewsAPI.org (optional,
  has a fallback) for real headlines behind the daily "hot topics."

## Project structure
- index.html — the entire app is one page; screens are
  <section class="screen" data-screen="..."> blocks toggled by
  showScreen() in app.js. Every element ID referenced by JS lives here.
- app.js — solo practice modes, all XP/streak/badge/heatmap state
  (localStorage key veritas_save_v1), navigation, audio. Defines
  window.DA (toast/todayStr/showScreen/playClick/awardXp) as the ONLY
  bridge the other two files may use to talk back to app.js.
- multiplayer.js — lobby, hot topics, matchmaking, live debate room.
  Defines window.mpOpenLobby. Reads window.DA + window.mpSupabase.
- ai-debate.js — solo AI debate + Devil's Advocate Drill. Reads
  window.DA + window.mpSupabase.
- supabase-config.js — Supabase client init + email/password auth
  (signUp/signIn/signOut, session check on load). Defines
  window.mpSupabase = {client, ready, signUp, signIn, signOut,
  getSession}. MUST load after the Supabase CDN script and before
  multiplayer.js/ai-debate.js.
- supabase/migrations/0001-0006 — run in numeric order (0004_profiles.sql
  no longer exists in this repo — it was the superseded/conflicting
  migration; 0006_reconcile_profiles.sql is the canonical profiles
  schema, see its header comment for the history).
- supabase/functions/*/index.ts — Deno Edge Functions. Each has a
  detailed header comment explaining its trigger, secrets needed, and
  manual test command — read it before changing that function.

## How Supabase is used
- EVERY client write to match_queue, debates, or profiles goes through a
  SECURITY DEFINER RPC function (attempt_match, submit_turn,
  submit_timeout_turn, submit_rating, set_display_name, sync_profile) —
  NEVER a raw .from(table).insert/update() from the client.
- expire_stale_debates() is granted to service_role ONLY. Never grant it
  to authenticated.
- notify_ai_referee() and apply_elo_update() failures NEVER block the
  turn-write that triggered them. Preserve this isolation pattern.
- Postgres arrays are 1-indexed: player_order[(turn_index % 2) + 1].

## Known gap: leaderboard weekly/XP tab is still mock
profiles.elo_rating, display_name, and progress are wired up client-side
now (see fetchProfileFromServer()/pushProfileToServer() in app.js). What
this actually gets you:
  - The leaderboard's ELO tab (renderEloLeaderboard()) queries profiles
    for real, ranked data.
  - Multiplayer opponents show their real display_name (falls back to
    "Opponent" only if the row has none set) — see multiplayer.js.
  - #profile-elo-sub / #home-stat-rating / #home-stat-winrate are
    populated from the cached server profile, not static placeholders.
  - Users can edit their own display_name from the Profile screen (the
    pencil icon next to the name) — setupProfileNameEditListeners() in
    app.js, writes through the existing pushProfileToServer()/
    sync_profile() path, same validation as the server (2-24 chars,
    letters/numbers/spaces/. _ ' -).
What's still a gap: the leaderboard's default "Weekly" tab
(renderXpLeaderboard()) is still 100% mock data — only the signed-in
player's own row (name + XP) is real, the other 10 rows are a seeded
fake list.

## Coding conventions
- camelCase in JS, snake_case in SQL/Postgres.
- Cross-file JS communication ONLY via window.DA / window.mpSupabase /
  window.mpOpenLobby — no import/export, no bundler.
- Every Supabase call: wrap in try/catch, toast() or silent fallback.
- SQL migrations are cumulative. To change turn-validation logic, add a
  NEW migration with CREATE OR REPLACE FUNCTION — never edit old files.

## Constraints
- Real email/password accounts (Supabase Auth), gated by the auth screen
  in init() — unauthenticated users see screen-auth, not Home. uid comes
  from the authenticated session, not a per-browser anonymous identity.
- No password-reset ("forgot password") flow exists yet.
- Real secrets live ONLY in Supabase Edge Function secrets, never in repo.
- notify_ai_referee() SQL body has literal <PROJECT_REF>/<AI_REFEREE_SECRET>
  placeholders that MUST be filled in per-deployment.
- 3 cron jobs do nothing until their cron.schedule() blocks are manually
  uncommented in 0001_init.sql and 0003_stale_debate_cleanup.sql.
- Tuned constants — confirm before changing: ELO K=32, maxTurnsPerPlayer=3,
  TURN_SECONDS=30, STALE_MINUTES=10.

## Security rules
- Never add client-facing INSERT/UPDATE RLS on match_queue/debates/profiles.
- Never grant expire_stale_debates() to authenticated.
- No content moderation exists on debate text — flag before extending public multiplayer.
- ai-debate Edge Function has no rate limiting — be cautious about increased call volume.

## Do not modify without asking
- The RLS/SECURITY DEFINER trust model.
- ELO formula/K-factor and turn/timer constants.
- The mock XP/"Weekly" leaderboard tab and its "Opponent" fallback label
  (the ELO tab and real display_name lookup are already live — see above).

## Testing
No automated test suite. Frontend: open index.html in browser directly.
SQL/RPC: test in Supabase SQL Editor on a non-production project first.
Edge Functions: use the manual curl command in each function's header comment.

## Avoid breaking things
- Re-read 0001/0002/0003 before touching submit_turn/attempt_match — each
  migration is a full redefinition, not a patch.
- Guard all window.DA/window.mpSupabase/window.mpOpenLobby reads — app.js
  already does this; preserve the pattern.
- Never remove escapeHtml() from renderDebateRoom() turn rendering.

## Profile avatars (Appwrite Storage — separate backend from Supabase)
Added after the auth migration (real email/password accounts, no more
anonymous-only). See README-AVATAR.md for full detail; summary:
- `appwrite-config.js` + `avatar.js` are a self-contained feature, wired
  into app.js in only 5 small spots (onScreenShown, cachedProfile shape,
  fetchProfileFromServer's select + parse, pushProfileToServer's payload,
  the sign-out reset) — grep app.js for "avatar" to find all of them.
- Appwrite is a SEPARATE identity system from Supabase, used only to
  scope Storage file permissions (own-file update/delete). It is NOT
  where "which account owns this avatar" is decided.
- The actual account-to-avatar link lives in Supabase:
  `profiles.progress.avatarFileId`, synced through the EXISTING
  `sync_profile` RPC — no new migration was added or needed. Do not
  reintroduce a localStorage-based avatar pointer; with real accounts now
  in play, that would leak one account's avatar into another signed into
  the same browser.
- `window.DA` gained `pushProfile()` (thin wrapper over
  `pushProfileToServer`) so avatar.js can sync immediately after upload.
- Known, accepted trade-off: replacing an avatar from a different browser
  than the one that originally uploaded it can't delete the old Appwrite
  file (different Appwrite anonymous session) — harmless storage orphan,
  not a bug, not yet worth building a full cross-backend identity bridge
  to fix.
- Not yet shown in the multiplayer debate room or leaderboard — flagged
  as a natural but separate follow-up in README-AVATAR.md.
