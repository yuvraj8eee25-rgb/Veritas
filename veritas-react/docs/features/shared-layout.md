# Shared layout

## 1. Purpose

Give a signed-in or guest learner one stable shell for Home, practice, Study, Evidence Lab, live debate, Classroom, leaderboard, and Profile. Current web routes are `/`, `/api/health`, and `/api/supabase-functions`; app screens are internal view states in `src/App.tsx`.

## 2. Current problems

- The root client app owns all screen navigation; views have no deep links or browser-history state (`src/App.tsx`, `src/app/client-app.tsx`).
- Global tokens and feature selectors share one large stylesheet, with later overrides and responsive rules mixed together (`src/styles.css`).
- Current panels use gradients, blur, and large shadows, which conflict with the requested flat visual direction (`.auth-card`, `.quiz-panel`, and later panel overrides in `src/styles.css`).
- Mobile navigation has breakpoint-specific visibility rules. Audit those with every destination present before changing its layout (`src/styles.css`, `src/App.tsx`).

## 3. Target design

- Use the 240 px desktop sidebar, 64 px top bar, and centered 1,360 px page shell from `../DESIGN.md`.
- Group nav destinations as Learn (Home, Study, Drills), Debate (AI Debate, Live 1v1), Research (Evidence Lab), and Workspace (Classroom, Leaderboard, Profile). Keep active destination visible by surface, accent, and a leading marker.
- At narrow widths, use a compact bottom bar with Home, Debate, Study, Live, plus a More menu that exposes every other destination.
- Keep toasts and guest-account prompts within the shell; do not obscure debate timers or primary actions.
- States: loading retains shell geometry; empty states explain the next action; errors use inline text or a toast with retry; success appears near the action.

## 4. Components used

- Existing: `Button`, `Badge`, `Card`, `Separator` from `src/components/ui/`; Lucide icons.
- Target: shared `PageShell`, `Sidebar`, `Toast`, and `StatusBadge`; the top bar and mobile navigation compose these shared components. Use Radix Dialog for dialogs and Radix Tabs for tabbed screens.

## 5. Files involved

- `src/App.tsx`
- `src/app/layout.tsx`
- `src/app/client-app.tsx`
- `src/styles.css`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/components/ui/separator.tsx`
- `../app/index.html` (vanilla navigation reference)

## 6. Done when

- [ ] At 1366x768 and 320x800, every screen retains the named shell and active destination.
- [ ] At 320 px, every destination is reachable without horizontal overflow.
- [ ] Keyboard traversal reaches navigation controls in visual order; current destination has aria-current or equivalent.
- [ ] Loading/error feedback does not cover the primary action or shift the shell by more than 8 px.
- [ ] selectors for this feature removed from src/styles.css.
