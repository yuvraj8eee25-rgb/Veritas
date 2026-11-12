# Veritas React project stack

## Runtime and libraries

- Next.js 16 App Router; React 19; TypeScript.
- Tailwind CSS 4 through @tailwindcss/postcss; Radix primitives are available through radix-ui; icons use lucide-react.
- Supabase JS client: @supabase/supabase-js.
- Redesign fonts: Space Grotesk for headings, Inter for body, JetBrains Mono for data, loaded with built-in next/font/google or next/font/local. Current CSS imports Inter from @fontsource-variable/inter; migrate font loading during the token step without adding packages.
- No new dependencies, schema changes, provider changes, or deployment changes without explicit approval.

## Styling and UI components

Tailwind utilities only. Tokens live as CSS variables in src/styles.css (or a new src/tokens.css). No new CSS modules. Each redesigned feature moves its selectors out of the monolithic stylesheet and deletes the old rules.

Shared UI components live in src/components/ui/. New UI must reuse those components before creating another primitive. Feature compositions belong in src/features/ and may build on shared primitives.

## Source tree

```text
src/
├── app/
│   ├── api/health/route.ts                 # GET health/config response
│   ├── api/supabase-functions/route.ts     # POST allowlisted Edge Function proxy
│   ├── client-app.tsx                      # client boundary; dynamically mounts App
│   ├── layout.tsx                          # root metadata and global stylesheet
│   └── page.tsx                            # /, Server Component
├── components/
│   └── ui/                                 # shared Button, Card, Input, Badge, etc.
├── features/                               # Study, Classroom, Profile, Evidence Lab, Arcade and data
├── lib/
│   ├── supabase.ts                         # Supabase browser client/config check
│   ├── supabase-functions.ts               # authenticated same-origin proxy client
│   └── utils.ts                            # shared utility helpers
├── App.tsx                                 # current internal screen state and application flows
└── styles.css                              # Tailwind import, tokens and current global/feature CSS
```

The vanilla reference is a sibling at ../app/; React imports selected question, mastery, study, and progress modules from ../app/src/. Do not treat the sibling's UI styles as React styles.

## Routes and component boundaries

| Path | Method | Client Component? | Rendering/component boundary |
| --- | --- | --- | --- |
| / | GET | Client UI: yes; route component: no | src/app/page.tsx is a Server Component mounting ClientApp; the client dynamically imports src/App.tsx with SSR disabled. Product screens are internal view states, not separate routes. |
| /api/health | GET | No | Next.js Route Handler; returns service status and whether public Supabase env vars exist. |
| /api/supabase-functions | POST | No | Next.js Route Handler; authenticated proxy allowlisting four Supabase Edge Functions. |
| /demo/index.html | GET | No | Static file under public/demo/, not a React component. |

src/App.tsx, src/features/Study.tsx, Classroom.tsx, Profile.tsx, EvidenceLab.tsx, and ArcadeDashboard.tsx are client-side UI modules. page.tsx and API handlers are server-side boundaries. Deep links and browser-history navigation are deferred until after the demo cut (see ROADMAP.md).

## State and storage

| Data | Current location/key | Scope and behavior |
| --- | --- | --- |
| Practice XP, streak, runs, daily completion, skills/assessments, activity, quests, achievements, combo | localStorage key veritas_save_v1 via ../app/src/features/practice-state.js | One browser key, not separated by guest/user. Signed-in progress is also sent to Supabase; signing in does not change this local key. |
| Study lessons, sessions, weekly target, bookmarks, reminder preferences | localStorage key veritas_study_v1:<ownerUid> | ownerUid is the authenticated Supabase user ID or literal guest. Earlier React values migrate from veritas-react-study-progress, veritas-react-study-prefs, and veritas-react-study-notes. |
| Pending Classroom result and idempotency request IDs | sessionStorage keys veritas-react-pending-assignment and veritas-react-submit:<assignmentId> | Current-tab retry/handoff data; removed when submission succeeds. Study-to-Classroom draft uses veritas:study-assignment-draft. |
| Once-only live debate XP award markers | localStorage key veritas:live-debate-xp:<uid>:<debateId>:<reward> | Prevents duplicate local reward application for completion/win in this browser. |
| Auth session, display name, profile progress, ELO, wins/losses/ties, Classroom records, debate rooms and avatars | Supabase Auth, tables/RPCs/Realtime, and private avatars Storage bucket | Profile loads fields and get_my_profile_progress; avatar URLs are signed for one hour. Profile writes use sync_profile; ratings and Classroom/debate state are server-backed. |

Profile progress sync is not debounced in current code: the src/App.tsx effect calls sync_profile whenever dependencies change (progress, display name, avatar path, auth/ready flags). saveDisplayName and uploadAvatar also call the RPC directly. There is no timer or debounce interval; adding one would be a behavior change.

## Agent conventions

- Read each file and its direct callers before editing it.
- Return complete edited files, not partial snippets.
- Do not add npm dependencies without asking.
- Work one feature per pass; preserve current data contracts and avoid schema/provider/deployment changes.
- For an implementation pass, run npm run build and fix build errors before declaring the pass done.
