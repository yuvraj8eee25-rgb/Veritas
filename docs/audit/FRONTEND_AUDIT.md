# Veritas frontend audit

**Snapshot:** 20 November 2026, local `main` working tree, including uncommitted files. Scope: the current Next.js/React app in `veritas-react/`, its imported legacy code in `app/src/`, and the separate Vite frontend as a maintained reference. Findings are based on source review, local static/tests, and a running **guest** browser session at `127.0.0.1:3000`; authenticated and microphone flows were not exercised. Related reports: [BUSINESS_AUDIT.md](BUSINESS_AUDIT.md), [BACKEND_AUDIT.md](BACKEND_AUDIT.md).

## Summary

The current guest Home and Practice navigation render and work. The interface has a coherent light/dark palette, visible keyboard focus rules, a skip link, labelled buttons on the narrow rail, reduced-motion CSS, and careful error/empty states in several flows. The most consequential frontend problem is **shared practice state across accounts**. The largest maintainability problem is that `src/App.tsx` still coordinates almost every feature in one roughly 1,300-line component, while three large stylesheets layer overrides. Accessibility and mobile behavior need deliberate verification beyond the two existing React test files.

| Priority | Meaning |
| --- | --- |
| P0 | Data exposure/loss or release blocker. |
| P1 | Material usability, accessibility, correctness, or maintainability risk. |
| P2 | Polish or scale improvement after P0/P1. |

## Architecture and coverage map

| Area | Current implementation | Assessment |
| --- | --- | --- |
| Rendering | `src/app/page.tsx` mounts `src/app/client-app.tsx`, which imports `src/App.tsx` with `ssr:false` (`client-app.tsx:6-9`). | Correct for heavy browser APIs, but the app is an entirely client-rendered island; initial content waits for JS and search engines only see the loading shell. |
| Navigation | One internal `View` union, hash/history handling in `src/App.tsx:123,295-325`, shell links in `src/components/AppShell.tsx:9-27`. | Browser back is partly handled; direct deep-link restoration is not. |
| State | Large root state for practice, auth, AI, live, speech, profile, and classroom handoffs (`App.tsx:150-280`). | Cross-feature coupling and high regression risk. |
| Shared behavior | Imports practice/mastery and Edge contracts from `../app/` (`App.tsx:12-16`). | Working dependency, but the “old” app cannot be removed; build/test boundaries are blurred. |
| Styling | `src/styles.css`, `src/workspace.css`, `src/mockup-ui.css` all globally imported (`src/app/layout.tsx:4-6`). | Responsive overrides and theme rules are spread across layers. |
| Feature UI | Screen components in `src/features/screens/`, complex components in `src/features/`. | Partial separation; many screens still receive a broad `Record<string, any>` view model. |
| PWA | Manifest and service worker, registered only in production (`client-app.tsx:12-16`, `public/sw.js`). | Basic shell support; offline guarantee and cache control are incomplete. |

## Detailed findings

### F-01 · P0 · One practice-progress key crosses guest and account boundaries

**Proof.** `app/src/features/practice-state.js:3,34-49` reads/writes one `localStorage` key, `veritas_save_v1`. React loads it once (`src/App.tsx:165`) and uses the same `progress` state after auth changes. On signed-in profile load it calls `sync_profile` with that local progress (`App.tsx:433-468`). Sign-out (`App.tsx:545-549`) does not clear or switch it. In contrast, in-progress practice sessions use owner-specific keys (`App.tsx:180-182`). `docs/PROJECT-STACK.md` also explicitly acknowledges this scope.

**User-visible failure path.** On a shared browser, A earns XP, signs out, B signs in, and B sees A's local progress; B's profile may be updated with A's XP/assessments. A fresh device with an existing server profile also starts with local defaults and can upload those defaults after profile-ready, because the fetched progress is only used to read `avatarFileId` (`App.tsx:441-453`). This is inferred from the code path; reproduce with disposable accounts before changing live data.

**Fix.** Namespace local progress by account ID and `guest`; on auth change load the new owner's state before enabling sync. Implement an explicit merge/import decision for guest progress, a server version/timestamp, and conflict behavior for two devices. Guard pending assignment result by account as well (`App.tsx:100-107,185`). Add two-account and two-device tests.

### F-02 · P1 · Navigation state is not a reliable direct link

**Proof.** Initial `view` is always `home` (`App.tsx:166`); `workspaceOpen` effect immediately `replaceState`s the current view at `#home` (`App.tsx:295-298`). Back/forward reads `history.state.veritasView`, not a bare hash (`App.tsx:299-315`). `docs/ROADMAP.md:16` lists route per screen as future work.

**Impact.** A copied `/#classroom` or refresh of a non-home screen can return to Home. Search, sharing, onboarding links, and help documentation cannot point to a stable destination. In-progress drills and debate rooms intentionally need special restoration rules, but ordinary pages can have stable routes.

**Fix.** Map public screen destinations to real routes or a validated hash on startup; keep ephemeral session states guarded. Add direct-load, refresh, back/forward, and unauthenticated redirect tests.

### F-03 · P1 · Mobile expanded sidebar behaves like an overlay without overlay semantics

**Proof.** `AppShell.tsx:29-90` toggles `sidebarExpanded` inside an `<aside>`. At ≤640px the expanded sidebar is `position:fixed`, width 224px, z-index 20 (`mockup-ui.css:218-223`). There is no backdrop, Escape handling, focus containment, or focus return to the toggle. It remains a navigation landmark rather than a disclosed dialog or mobile navigation panel.

**Impact.** Keyboard and screen-reader users can continue into obscured content; touch users lack a clear dismiss target outside the panel. This requires an actual mobile/assistive-tech check, but the missing behaviors are visible in source.

**Fix.** Keep the compact rail as requested, then give mobile expansion a backdrop and Escape/close behavior; return focus to the toggle. Either make the panel modal with correct focus/inert semantics or use a nonmodal layout that does not cover interactive content.

### F-04 · P1 · Collapsed letter rail is ambiguous for sighted non-hover users

**Proof.** Each nav item displays `name.charAt(0)` (`AppShell.tsx:56-61`). The rail shows duplicate `P`, `D`, and `L` entries (`AppShell.tsx:9-21`); names are hidden with CSS (`mockup-ui.css:136-138`). Accessible labels and mouse/focus tooltips do exist (`AppShell.tsx:48-54,56-61,80`). The running guest view at 733×897 visibly showed the compact letter rail.

**Impact.** A touch user scanning the collapsed rail cannot distinguish Practice from Profile, Daily Challenge from Debate the AI, or Leaderboard from Live 1v1 without expanding it. This may be acceptable as a compact mode only if the expansion affordance is obvious and persistent enough.

**Fix.** Preserve the requested single-letter design, but add short text labels in a touch-accessible reveal or use distinct two-letter abbreviations for collisions; test with first-time users before settling the pattern.

### F-05 · P1 · Root state and broad view models make regression likely

**Proof.** `src/App.tsx` is about 1,300 lines and declares dozens of `useState`/`useRef` variables for unrelated flows (`App.tsx:150-280`). A single `appViewModel` object lists virtually all setters, data, and actions (`App.tsx:1179`), then screen components often type it as `Record<string, any>` (e.g. `AuthScreen.tsx:3`). The roadmap itself calls for splitting root state (`docs/ROADMAP.md:8`).

**Impact.** TypeScript does not enforce most screen contracts. An auth or live-debate change can affect render cycles across all screens, and timer/cleanup effects are difficult to reason about. The code has good individual guards, but architecture makes them hard to maintain.

**Fix.** Move state, effects, and commands into per-feature controllers/hooks; keep auth, navigation, and cross-screen handoff at the root. Give each screen an explicit props interface. Extract shared request and assignment types before broad visual changes. Refactor in behavior-preserving slices with tests for each state transition.

### F-06 · P1 · Current React app has no standard test/release script

**Proof.** `veritas-react/package.json:5-9` exposes only `dev`, `build`, `start`; two `.mjs` test files are present under `veritas-react/tests/`. No `.github/` workflow is in this checkout. The older Vite `app/package.json` has typecheck, focused/unit/E2E, assets, and `test:ci` scripts; its README claims GitHub Actions run smoke tests (`app/README.md:137-155`), which cannot be confirmed from this checkout.

**Impact.** A developer can build or ship the current app without running TypeScript or tests. Legacy CI, even if it exists elsewhere, does not cover the current app's sidebar, auth, Classroom, and AI screens.

**Fix.** Add `typecheck`, `test`, and `check` scripts in the Next app and a repository workflow that runs them plus a clean production build. Prioritize guest baseline, account switch, direct links, responsive navigation, Evidence Lab states, and two-user Classroom/live tests in a non-production backend.

### F-07 · P1 · Global CSS layering and hard font override undermine the design system

**Proof.** Three stylesheets are imported globally (`layout.tsx:4-6`). `mockup-ui.css:113` applies `font-family: Gill Sans… !important` to html, body, and all form controls; `styles.css` is largely dense multi-rule lines and `workspace.css` has over 2,000 lines. `mockup-ui.css:144-194` overrides many workspace elements; `docs/PROJECT-STACK.md` and `docs/ROADMAP.md` intend shared tokens/primitives and stylesheet retirement.

**Impact.** A feature-level visual adjustment can break other screens or dark mode. Font fallback varies by operating system. Dense one-line rules make contrast, specificity, and responsive review slower.

**Fix.** Consolidate tokens and typography in one layer, keep shell CSS local to shell, migrate feature styles incrementally, remove obsolete selectors, and format stylesheets for review. Snapshot test representative light/dark and mobile screens during migration.

### F-08 · P1 · Auth page has stale product copy and incomplete tab behavior

**Proof.** The signed-in auth branch says “The React shell is set up. The next migration step will bring over your Home dashboard” (`AuthScreen.tsx:27`), although Home already exists. The login/signup controls declare `role=tablist` and `role=tab` (`AuthScreen.tsx:37-40`) without an associated tabpanel, roving tabindex, or arrow-key handler. The latter is a source-based accessibility concern, not a completed assistive-tech test.

**Impact.** Stale copy reduces trust. Custom tab semantics promise a keyboard interaction model the component does not implement.

**Fix.** Remove migration text. Use plain segmented buttons with `aria-pressed`, or implement actual tabs with a tested primitive and tabpanel relationships.

### F-09 · P1 · Service worker caching is too broad and offline support is not proven

**Proof.** `public/sw.js:17-23` intercepts every same-origin GET except `/rest/v1/` and `/functions/v1/`; both actual Supabase calls are cross-origin and the Next proxy is POST. Cache-first behavior stores any successful same-origin GET, including health and future API routes, with no entry limit or aging (`sw.js:23-27`). The install precache includes only HTML, manifest, and icon (`sw.js:1-7`), while JS/CSS chunks are cached only when requested after the worker controls the page.

**Impact.** Health responses may become stale, cache can grow, and a first-load “installed” app may still fail offline because runtime chunks were never fetched under service-worker control. “Offline practice” needs a production-build browser test.

**Fix.** Exclude `/api/` and auth/data endpoints; version and bound asset caches; precache or explicitly validate all files needed for offline practice. Test fresh install → offline launch, upgrade, and stale-asset recovery.

### F-10 · P2 · PWA and metadata are minimal for a public educational app

**Proof.** `layout.tsx:8-17` sets one generic title/description and fixed light `themeColor`; the app can toggle dark mode (`use-veritas-theme.ts`). One client route means no page-specific metadata. Manifest/icon exist.

**Impact.** Shared links lack destination-specific context; dark browser chrome may mismatch. This is lower priority until routes and product positioning are decided.

**Fix.** Introduce route-specific metadata once real routes exist; check dark theme color and install assets in production.

### F-11 · P1 · Evidence/AI fallbacks need a stronger visual distinction

**Proof.** AI debate can synthesize a local length/cue estimate when the referee fails (`App.tsx:1154-1160`). Live debate shows an estimate while the referee is pending (`App.tsx:79-96`; `LiveDebateRoomScreen.tsx`). The code labels these states, which is good. Evidence Lab has extensive verification and abstention tests (`veritas-react/tests/evidence-verification.test.mjs`), but `veritas-react/README.md` still calls for a real authenticated provider check.

**Impact.** The user may equate a provisional heuristic score with the final provider result if both share the same result visual hierarchy. An evidence “confidence” number can be similarly overread.

**Fix.** Keep provisional badges persistent, visibly separate the final result when it arrives, and explain what was assessed and what was not. Validate comprehension with users.

## Positive implementation evidence

- The shell has a skip link, labelled rail controls, `aria-current`, focus handling on view changes, and online/offline status (`AppShell.tsx:36-89`).
- Theme choice is stored defensively and restored before interactive render (`use-veritas-theme.ts`, `layout.tsx:19-24`); dark mode visibly rendered in the guest browser.
- CSS includes `:focus-visible` and reduced-motion rules (`workspace.css:86`, `mockup-ui.css:195`, `styles.css:90`).
- Evidence source links use safe external-link attributes in the React results (`EvidenceResults.tsx:20,44,61,96`).
- The current XP leaderboard explicitly calls entries samples; ELO is described as live (`LeaderboardScreen.tsx:28-49`).
- Speech cleanup and stale-response guards exist in `App.tsx`; these still need a real permission/browser test.

## Screen-by-screen review checklist

This matrix records the main UI surface and the **next verification**, not a claim that every action was browser-tested.

| Screen / flow | Code location | Observed or source-supported strength | Highest-value follow-up |
| --- | --- | --- | --- |
| Auth and guest | `features/screens/AuthScreen.tsx` | Guest entry, password reset/recovery, status/error messages, theme toggle | Two-account switch, recovery link, tab keyboard pattern, stale copy. |
| Home | `features/screens/HomeScreen.tsx` | Clear first action, resume card, alternate paths, guest account prompt | Verify recommendation after varied practice; mobile long names and progress ownership. |
| Practice setup/drill/summary | `PracticeSetupScreen.tsx`, `SoloDrillScreen.tsx`, `PracticeSummaryScreen.tsx`, `App.tsx` | Four drill modes, difficulty, resume, explanations | Keyboard-only question flow, 5-second timer usability, repeated-item effects, save/resume. |
| Daily and Arcade | `DailyChallengeScreen.tsx`, `ArcadeDashboard.tsx`, `features/arcade.ts` | Return loop and visible goals | Midnight/time-zone behavior, duplicate reward prevention across tabs/devices. |
| Study | `features/Study.tsx`, `features/screens/StudyScreen.tsx` | Lessons, reflections, notes, Classroom handoff | Local-storage quotas, long lesson navigation, source-link accessibility, owner isolation. |
| Evidence Lab | `features/EvidenceLab.tsx`, `EvidenceResults.tsx`, `lib/evidence-investigation.ts` | Source trace, abstention/retry logic, cited findings | Real authenticated provider run, empty/partial results, source comprehension and mobile trace. |
| AI debate | `AiDebateSetupScreen.tsx`, `AiDebateRoomScreen.tsx`, `AiDebateResultScreen.tsx` | Topic/stance/turn options, provisional result label | Provider timing, speech permission/transcript review, fallback distinction. |
| Live 1v1 | `LiveLobbyScreen.tsx`, `LiveSearchScreen.tsx`, `LiveDebateRoomScreen.tsx` | Match state, timer, rating/result UI | Two browsers/accounts, disconnect/reconnect, room expiry, opponent accessibility. |
| Profile/leaderboard | `features/Profile.tsx`, `ProfileViewScreen.tsx`, `LeaderboardScreen.tsx` | Separate ELO from sample XP, profile/skills view | Cross-account progress, avatar upload errors, small-screen tables/charts. |
| Classroom | `features/Classroom.tsx`, `ClassroomScreen.tsx` | Broad assignments, invites, attachments, grading, retry UX | Student/coach authorization, lengthy forms on mobile, stale draft/account switch. |
| Shared shell/PWA | `components/AppShell.tsx`, `public/sw.js` | Skip link, focus styles, status banner, dark mode | Expanded-mobile focus behavior, offline reload, cache upgrade, first-load performance. |

## Performance and accessibility verification plan

- **Performance:** Record production-build JS/CSS bytes, first meaningful render, interaction delay, and long-task profile on a low-end phone. A client-only app plus a large root component is a risk, but no numerical performance claim is made without a trace. Check whether complex Classroom/Evidence code can be loaded only when needed.
- **Accessibility:** Run automated axe checks on representative screens, then manually test keyboard order, Escape/focus return, screen-reader names/status changes, 200% zoom, forced colors, reduced motion, and contrast in both themes. Automated checks alone will not catch the letter-rail ambiguity or whether the evidence trace is understandable.
- **Responsive:** Check 320, 375, 640, 720, 1024, and wide desktop widths; include landscape phone and short viewport height. The three CSS layers use several nearby breakpoints, making edge widths important.
- **Failure states:** For each networked screen, simulate no session, expired token, quota denial, offline, 429/5xx, timeout, partial response, and retry. Preserve user input and show the next available action.
- **Privacy:** Verify no transcript, assignment, or evidence draft from a previous account remains visible after sign-out or account switch in the same tab.

## Original Vite app and shared-code boundary

The original app remains runnable from `app/` and is more mature in test scripting (`app/package.json`). Its entry imports feature modules and optional monitoring (`app/src/main.js:1-4`), and it has a separate service worker (`app/src/pwa.js`). React imports legacy practice/mastery code and Edge-side types directly, so a change to a seemingly retired file can change the current Next product. Before deleting or reorganizing the Vite tree, list every `../../app/` or `../../../app/` import from React and move those contracts into a versioned shared package. Until then, run both TypeScript/test suites on every change to imported code.

The legacy `app/public/about.html` and demo assets are not part of the current Next route tree (`veritas-react/docs/OUT-OF-SCOPE.md`). Decide explicitly whether they should be migrated, linked as a static informational page, or retired. Keep screenshots and claims in those assets aligned with the real product. The existing `app/dist/` assets passed the size check, but a **fresh** Vite build was not verified because native Rollup could not load in this environment.

## Verification performed

| Check | Result |
| --- | --- |
| Next app `tsc --noEmit --incremental false` | Pass. |
| React Node tests `node --test tests/*.mjs` | Pass: 37 tests, 0 failures. Mostly evidence parsing/verification and contract behavior. |
| Guest browser at `127.0.0.1:3000/#home` | Home rendered; expand/collapse rail and Home → Practice → Home navigation worked. Guest screen displayed four drills with 7–9 questions per bank. No automated visual/accessibility assertions were run. |
| Default `next build` | Could not compile in this environment: macOS native SWC binding could not load under the bundled ChatGPT Node; Turbopack does not accept WASM binding. |
| `next build --webpack` | Also blocked by unavailable `lightningcss.darwin-arm64.node`. This is an environment/dependency loading blocker, not evidence of an application compile error. |
| Legacy `app` TypeScript, focused tests, JS syntax, Edge syntax, asset check | Pass (focused: 6/6); legacy Vitest and Vite build blocked by the same native Rollup signature issue. |

## Recommended order

1. Fix owner-scoped progress and account handoff, including the pending assignment owner key.
2. Add a current-app quality gate and two-account/regression tests.
3. Make ordinary screens directly addressable and restoreable.
4. Resolve mobile overlay focus/dismiss behavior and test 320px–desktop in both themes.
5. Split `App.tsx` by feature and replace broad `any` view models; retire CSS layers gradually.
6. Tighten service worker caching and prove offline practice with a production build.

## Limits

The browser inspection was guest-only and at one observed viewport. No full WCAG audit, screen-reader session, device matrix, performance trace, audio permission test, or authenticated Classroom/live test was performed. Findings based on code paths are identified as such and should be reproduced in a disposable environment before changing production data.
