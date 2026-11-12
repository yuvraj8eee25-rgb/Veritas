# Veritas UI redesign roadmap

Implement in order. The demo cut includes the shell, auth, debate foundation and modes, and Home.

| Step | Scope | Release | Dependencies and exit condition |
| --- | --- | --- | --- |
| -2 | Fix mojibake at source across the React project, vanilla reference files used by React, and public/demo/. | Preparation | Diagnose the repeated UTF-8-as-Windows-1252 sequences (for example ’ and –) in actual file bytes, restore intended punctuation at source, then scan the scoped app/reference files for remaining corrupted sequences. Do not replace valid Unicode punctuation. |
| -1 | Split src/App.tsx into one component per screen under src/features/ with no visual or behavioral change. Keep root state only for navigation and genuinely shared cross-screen flows; move screen state with its screen where possible. | Preparation | Preserve all existing state transitions, timers, storage, auth, Supabase calls, and event handlers. Build after extraction and compare before/after screen behavior. |
| 0 | Tokens, fonts, and shared primitives | Demo cut | Implement the tokens and canonical glossary from DESIGN.md once in src/components/ui/; use next/font with no added dependencies. Include Button, Card, MetricCard, Input, Modal, Tabs, Badge, Sidebar, PageShell, Toast, AlertBanner, EmptyState, Skeleton, ProgressBar, StatusBadge, Avatar, Select, Tooltip, and Table. |
| 1 | Shared layout | Demo cut | Depends on 0. Establish desktop sidebar/top bar, mobile navigation, page gutters, loading/error shell behavior, and every destination. |
| 2 | Auth and guest access | Demo cut | Depends on 0-1. Preserve sign-in, sign-up, recovery, reset, and guest flows; use Radix Tabs for Sign in / Sign up and a Forgot password text link. |
| 3 | Debate room foundation | Demo cut | Depends on 0-2. Deliver shared transcript, sticky turn/clock/round bar, composer, mic permission/recording states, and result shell before mode-specific polish. |
| 4 | AI Debate and Live 1v1 | Demo cut | Depends on 3. AI adds topic setup, source attribution, referee and fallback states; Live adds matchmaking, private rooms, ratings, and two-account flows. |
| 5 | Home dashboard | Demo cut | Depends on 1-4. Connect navigation, progress, daily challenge, and feature entry points; label local, sample, and Supabase data accurately. |
| 6 | Route per screen | After demo | First post-demo task. Decide route mapping and browser back/forward behavior; then implement deep links and restore behavior without breaking flows. |
| 7 | Profile | After demo | Depends on 2 and 5. Preserve local XP/mastery versus Supabase ELO/profile distinctions. |
| 8 | Leaderboard | After demo | Depends on 2 and 5. Use Radix Tabs for Practice XP / Live ELO; mark sample XP versus live rating. |
| 9 | Solo drills | After demo | Depends on 0-1. Standardize setup, timer, answer feedback, and summary across four formats. |
| 10 | Daily challenge and Arcade | After demo | Depends on 9. Add daily completion, goals, combos, achievements, and reward feedback. |
| 11 | Evidence Lab functional bug fix | After demo | Read docs/BUGS.md; fix proxy/Edge Function transport and empty-result handling as a functional task before any Evidence Lab redesign. |
| 12 | Evidence Lab redesign | After demo | Depends on 0-1 and completion of step 11. Design the trace, results, source review, caveats, and native <details> trace disclosure. |
| 13 | Study | After demo | Depends on 0-1 and 9. Reuse ProgressBar; use native <details> for source disclosure and preserve lesson transfers. |
| 14 | Classroom | After demo | Depends on 2-4 and 9. Preserve role-gated assignments, submissions, grading, attachments, discussions, analytics, and retries. |
| 15 | Club preview | After demo | Depends on 1 and 5. Keep sample/browser-only provenance explicit; do not imply server persistence. |
| 16 | Cross-screen QA | After demo | Depends on 0-15. Check 320 px through desktop, keyboard order, reduced motion, long content, realistic data, and error/retry paths. |

## Dependencies and decisions

- Shared primitives and shell precede all feature redesign. Debate room is the first substantial screen because AI and Live share the transcript, clock, audio capture, error, and outcome states.
- AI Debate and Live 1v1 share room presentation only; provider/referee and matchmaking/rating flows remain distinct.
- Home follows the demo-cut debate flows so its main actions and status summaries match real behavior.
- Daily/Arcade depends on stable solo question/result UI. Classroom depends on auth, drills, and debate submission flows.
- Evidence Lab has a functional transport task before any redesign; it does not depend on Classroom or multiplayer.
- Deep links and browser back/forward are deferred until after the demo cut. The first post-demo task is route per screen.
- Deferred items and their scope rationale are listed in OUT-OF-SCOPE.md.
- No schema changes, new packages, provider changes, or deployment changes are included.

## Stylesheet retirement

Every feature's Done when checklist must include: “selectors for this feature removed from src/styles.css”. During its redesign, move that feature's selectors to Tailwind utilities and delete the old rules. Keep shared tokens in CSS variables per DESIGN.md.
