# Veritas React Project Guide

## Overview

This directory contains Veritas's Next.js and React implementation. The existing vanilla JavaScript application lives beside it in `../app/` and remains the behavior reference. The React screens are currently rendered inside one client-side application shell.

## Stack

| Area | Technology |
| --- | --- |
| Web framework | Next.js App Router 16.x |
| UI and language | React 19, TypeScript 5.9 |
| Styling | Tailwind CSS 4, `src/styles.css`, `tw-animate-css` |
| UI primitives | Shared primitives in `src/components/ui/`; shadcn CLI configured by `components.json`; Radix UI and `class-variance-authority` |
| Icons | Lucide React |
| Fonts | Current React app: Inter Variable. Typography target: Space Grotesk for headings, Inter for body text, and JetBrains Mono for scores, timestamps, and other data labels. Space Grotesk and JetBrains Mono are not currently bundled in React; serve them locally before using them in the UI. |
| Backend | Supabase Auth, Postgres, Realtime, Storage, RPCs, and Edge Functions |
| Server routes | Next.js Route Handlers for health checks and an allowlisted Supabase Edge Function proxy |

## Folder map

```text
veritas-react/
├── public/                       # PWA assets, icons, service worker, static pages
├── src/
│   ├── app/                      # Next.js route tree and layouts
│   │   ├── api/health/            # GET /api/health
│   │   ├── api/supabase-functions/# POST /api/supabase-functions
│   │   ├── client-app.tsx         # Client boundary; loads the interactive app
│   │   ├── layout.tsx             # Root HTML metadata and global stylesheet import
│   │   └── page.tsx               # GET /; mounts ClientApp
│   ├── components/ui/             # Shared Button, Badge, Card, Input, Separator, Textarea
│   ├── features/                  # Study, Profile, Classroom, Evidence Lab, drills, topic data
│   ├── lib/
│   │   ├── supabase.ts            # Supabase browser client and configuration check
│   │   ├── supabase-functions.ts  # Authenticated call to the Next.js function proxy
│   │   └── utils.ts               # Shared component utilities
│   ├── App.tsx                    # Main client-side state, navigation, and activity flows
│   └── styles.css                 # Tailwind imports, theme tokens, shared and existing screen styles
├── components.json               # shadcn CLI aliases and style configuration
└── PROJECT-STACK.md

../app/                            # Legacy vanilla app and shared reference logic/migrations
```

## Routes and client boundaries

| URL | Purpose | Rendering |
| --- | --- | --- |
| `/` | Veritas application; internal views are switched in `src/App.tsx`, not separate URLs | `src/app/page.tsx` mounts the client-only `ClientApp`, which dynamically loads `src/App.tsx` with SSR disabled |
| `/api/health` | Reports app health and whether public Supabase configuration is present | Next.js Route Handler, GET |
| `/api/supabase-functions` | Authenticates and forwards an allowlisted request to a Supabase Edge Function | Next.js Route Handler, POST |

The root app's internal views include Home, practice setup, drills, daily challenge, profile, leaderboards, Study, Classroom, Evidence Lab, AI debate setup/room/result, and live lobby/search/room. Login, signup, recovery, and reset are modes in the root client app rather than separate routes. Feature components such as `Study.tsx`, `Classroom.tsx`, `EvidenceLab.tsx`, and `Profile.tsx` render beneath this client boundary.

## Styling and component rules

- For new UI, use Tailwind utilities in JSX. Put shared color, spacing, radius, and typography tokens in `src/styles.css`.
- Existing screens still use feature-specific selectors in `src/styles.css`; keep edits scoped to the screen being changed. Do not add CSS Modules or another global stylesheet.
- Reuse components in `src/components/ui/` before creating a new primitive. Extend an existing component when that keeps its API clear; use the shadcn CLI for a missing standard primitive.
- Typography target: Space Grotesk headings, Inter body copy and controls, JetBrains Mono for numeric/data labels. React currently bundles only Inter Variable, so do not claim the target fonts are active until local font assets and CSS are added.
- Preserve readable contrast, visible keyboard focus, reduced-motion behavior, and clear loading, empty, success, and error states.

## State and persistence

- Drill progress, XP, streaks, achievements, and daily completion use browser `localStorage` through the practice state module shared from `../app/src/features/practice-state.js` (`veritas_save_v1`). Guest progress remains on that browser. For signed-in users, the app best-effort syncs the profile progress fields to Supabase with the `sync_profile` RPC after profile load and when progress changes; local progress remains the immediate source if sync fails.
- Study progress, reviews, sessions, bookmarks, and reminder preferences use `localStorage` under a user-specific key (`veritas_study_v1:{uid}`; `guest` when signed out).
- Pending Classroom activity results, idempotency IDs, and Study-to-Classroom draft handoff use `sessionStorage`; they are scoped to the current browser tab/session.
- Authenticated profile data, ELO ratings, multiplayer rooms/turns, queues, classroom organizations/assignments/submissions, and discussion data live in Supabase and are accessed through the public client under database permissions/RLS and RPC rules.
- Avatars, classroom attachments, and debate recordings are uploaded to private Supabase Storage buckets. The app requests short-lived signed URLs for authorized display/playback.
- Do not move provider credentials or service-role keys into the browser. Keep them in Supabase secrets or server-only configuration.

## Browser microphone and recording states

Speech debate screens must communicate each state in the debate room:

1. **Unsupported:** `getUserMedia` or `MediaRecorder` is unavailable; explain the limitation and offer written practice.
2. **Permission pending/denied:** show that microphone access is needed; if the browser denies it, explain how to enable access or continue in written mode.
3. **Recording:** show a clear active indicator and remaining time; provide stop/cancel behavior.
4. **Processing/transcribing:** indicate that work is in progress and prevent duplicate submission.
5. **Review ready:** provide editable transcript, audio playback, and a clear send action.
6. **Failure or cancellation:** explain the error, preserve recoverable input where possible, and allow retry or written entry. Stop media tracks and clear timers when the user cancels, navigates away, times out, or signs out.

Do not rely on color alone for permission, recording, or error state.

## Agent conventions

- Read the target file and nearby components before editing; follow the existing pattern and preserve unrelated behavior.
- Reuse the current UI primitives and utilities. Do not add dependencies without asking first.
- When asked to provide a file, return the complete file rather than an excerpt. When editing the workspace, summarize the files changed and any checks run.
- Keep secrets out of source, Markdown examples, logs, and `NEXT_PUBLIC_*` variables.

## Local setup

Create `veritas-react/.env.local` with the public Supabase project URL and anon/publishable key:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-or-publishable-key
```

From this directory, install dependencies and start the development server:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. The health endpoint is `http://localhost:3000/api/health`.

Useful commands:

```powershell
npm run dev
npm run build
npm run start
```
