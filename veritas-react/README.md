# Veritas React + Next.js

Next.js App Router application for the React implementation of Veritas. The original vanilla app remains in `app/` as the behavior reference. The interactive Veritas experience is mounted as a client-only island because it uses local storage, audio recording, and browser APIs. New server-rendered pages and Route Handlers can be added alongside it.

## Run locally

1. Copy `.env.example` to `.env.local` in the `veritas-react/` project root.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the public Supabase project values used by the existing app.
3. From `veritas-react/`, run `npm install`, then `npm run dev`, and open `http://localhost:3000`.

The `GET /api/health` Route Handler provides a deployment health check. The `POST /api/supabase-functions` Route Handler forwards authenticated requests to an allowlist of existing Supabase Edge Functions, propagates a request ID, and returns a bounded timeout error for slow upstream calls. AI and evidence provider secrets stay in Supabase; the Next.js route never accepts or forwards service-role keys.

Never put Supabase service-role keys or AI provider secrets in `NEXT_PUBLIC_*` variables or client code.

## Migration checklist

- [x] Foundation: Next.js App Router + React + TypeScript + Tailwind app
- [x] Account access: email/password sign-in, sign-up, password reset, recovery, sign-out, and guest-only local practice with a Home account-creation prompt
- [x] Home dashboard and responsive navigation shell (XP/rank/streak, recent practice, mastery estimates for four drill skills, a next-skill recommendation, recent best scores, and a most-practised drill shortcut; practice links open all four formats)
- [x] Browser-only student/coach club workflow preview, served from Next.js public assets and linked from Home
- [x] Fallacy Hunter, Rebuttal Practice, Quick Drills (5-second timer), and Steelman Challenge
- [x] Daily Challenge (four-question rotating practice sprint, midnight reset, once-daily completion, 3x XP; rotation across all four practice modes)
- [x] Arcade daily goals, combo tracking, XP rewards, and achievement unlocks
- [x] Profile and avatar (local stats, best-effort `sync_profile` progress sync after authenticated profile load and progress changes, synced display name, private Supabase Storage upload)
- [x] Leaderboards (sample XP standings are labelled; live ELO rankings query Supabase profiles)
- [x] Debate the AI (3- or 5-turn written/speech practice, 3-minute/45-second/unlimited written timing with per-turn clock and timing records, opponent difficulty, AI referee, topic browser with live hot-topic lookup, news publisher attribution and 20 local suggestions, Surprise me and random-side controls, local estimate fallback, and optional scored Devil’s Advocate drill)
- [x] Recorded speech practice in AI debates (microphone cleanup on cancellation, timeout, navigation and unmount with stale transcript protection, transcript review, private upload, playback)
- [x] Recorded speech in multiplayer debates (microphone cleanup on cancellation, timeout, navigation and unmount with stale transcript protection, transcript review, private audio upload, turn playback)
- [x] Live 1v1 lobby and public matchmaking with news-source attribution for current topics (apply `0016_leave_training_queue.sql` for safe cancellation)
- [x] Live debate room scoreboard (both player ELO ratings, server-time turn clocks, cumulative thinking time, round progress and turn elapsed labels), AI referee scores, winner and turn-by-turn feedback with an immediate labelled local estimate, timeout handling, match ratings, refreshed ELO delta, public/private rematches, +60 XP completion reward and +40 XP winner bonus (deduplicated per user and debate)
- [x] Private invite rooms (Supabase migrations `0015_training_and_speech.sql` and `0016_leave_training_queue.sql` are applied to the linked project)
- [x] Study paths, scored lesson practice and reflections, spaced review queue, weekly session goals, saved Field Notes, in-site weekday reminders, lesson transfers, and Classroom draft handoff
- [x] Classroom organizations and cohorts, invite links and email invitations, membership roles, position papers, assigned drills and AI/live/private debates with configurable written/speech mode, speech length and turn count plus automatic, retry-safe submission across same-tab reloads, assignment templates and duplication, configurable draft/published visibility, attempt/deadline/attachment/reply policies, editable rubrics, submissions and rubric feedback, editing, archival and deletion, private attachments with authorized signed downloads, announcements, read receipts, discussions, moderation, and participation/drill analytics
- [x] Evidence Lab two-sided search, source classification, weighted verdict, confidence, evidence summary, and visible investigation trace
- [x] Advanced Evidence Lab subclaim planning, bounded adaptive retries, cross-examination, quality-directed research recovery, targeted verification, and visible replan trace (`assess-evidence` deployed to the linked project)
- [x] PWA app shell, install metadata, offline shell caching, and scrollable mobile navigation

The advanced Evidence Lab actions add actions and fields to the existing `assess-evidence` function and require no database migration or new secret. The local React implementation has bounded execution budgets of 10 steps, 5 searches, 12 sources, and 8 AI calls. Migrations `0014`–`0016` are applied and the updated `ai-debate`, `ai-referee`, `assess-evidence`, and `classroom-service` functions are deployed to the linked Supabase project. Preserve the Supabase RPC and Row Level Security contracts documented in `app/`.


## Remaining parity work

- The vanilla Home screen's four-skill Drill mastery overview, lowest-mastery next-step recommendation, mode best-score labels, and most-practised drill shortcut are now present in React. The existing mastery estimates remain estimates from fresh drill assessments, not validated measures of general debate ability.
- Classroom parity is partial: the legacy app also supports end-to-end verification of optional classroom-service email delivery. The React workspace now supports organizations, invite links, role management, attachments, announcements, discussions, grading drafts, archival, and basic analytics. End-to-end invitation email delivery still needs verification against a deployed Supabase project with the Edge Function secrets configured.
- Evidence Lab's documented adaptive flow is implemented locally and the updated function is deployed. A real authenticated search run is still needed to verify provider responses and recovery behavior end to end.
- The AI Debate Devil’s Advocate follow-up uses the existing `ai-debate` `drill` action through the Next.js function proxy; the function is deployed; provider-backed scoring still needs an end-to-end session check.
- Supabase migrations `0014`–`0016` and the updated Edge Functions are deployed to the linked project. Invitation email delivery, authenticated classroom workflows, live multiplayer, speech recording, and provider-backed AI flows still need end-to-end verification with real user sessions before production readiness can be claimed.
- XP leaderboard entries remain sample data; ELO standings use Supabase profiles.
