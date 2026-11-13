# Home dashboard

## 1. Purpose

Orient the learner, show current practice progress, and offer one clear next step into drills, Debate the AI, Live 1v1, Evidence Lab, Study, and Classroom.

## 2. Current problems

- Home metrics, shortcuts, quests, recommendations, and navigation are composed in the long root screen branch (`src/App.tsx`), so content order and visual hierarchy are hard to tune independently.
- The screen currently mixes sample XP leaderboard language with live profile/ELO data elsewhere; labels must preserve that distinction (`src/App.tsx`, `src/features/ArcadeDashboard.tsx`).
- Card surfaces inherit gradients/shadows and typography is mostly Inter; this differs from the requested flat data-forward dashboard (`src/styles.css`).

## 3. Target design

- Desktop grid: page title and account status first; the primary practice Card; a compact row for XP, streak, rank, and weekly activity; then mastery/recommendation and daily goals. Put secondary shortcuts below the main action.
- Show four assessed drill skills with “Unassessed” when no assessment exists. Explain that these are estimates from drill results, not general debate ability.
- Keep sample XP standings explicitly marked as sample; show live ELO only when loaded from Supabase.
- States: first-use empty progress with start-practice action; loading profile/sync with Skeletons; sync/network error as non-blocking AlertBanner; daily goal complete with completion state; completed quests/achievements use StatusBadge.

### Wireframe: Home (two states)

```text
1366 x 768 | 240 px Sidebar | 64 px top bar | 24 px PageShell gutter
+------------------------+---------------------------------------------------------+
| Sidebar 240 px         | TopBar 64 px [Text muted / 12 px Inter]                 |
| [nav, active Home]     +---------------------------------------------------------+
| Surface #0D1622        | PageShell [Background #080D18]                         |
| Text secondary 14/20   | H1 30/38 Space Grotesk [Text primary]                 |
|                        | Card [Surface]                                        |
|                        | RETURNING: Button “Continue practice” [Accent]         |
|                        | FIRST USE: Button “Start practice” [Accent]            |
|                        | MetricCard XP | Streak | Rank [Mono values]            |
|                        | ProgressBar drill mastery [Accent on Surface]          |
|                        | Card daily challenge + shortcuts [Text secondary]       |
+------------------------+---------------------------------------------------------+
RETURNING: metric values, mastery ProgressBar, and daily challenge shown.
FIRST USE: EmptyState replaces metrics/progress; primary Button remains.
Primary action: returning users see “Continue practice”; first-use users see “Start practice”.
```

## 4. Components used

- Existing: `Card`, `Button`, `Badge`, `ArcadeDashboard`, Lucide icons.
- Target: reusable `MetricCard`, `ProgressBar`, `EmptyState`, and compact activity row; use Radix Tooltip for explanatory metric definitions.

## 5. Files involved

- `src/App.tsx` (Home, progress summaries, shortcuts)
- `src/features/ArcadeDashboard.tsx`
- `src/features/arcade.ts`
- `src/features/practice-questions.ts`
- `src/lib/supabase.ts`
- `src/styles.css`
- `../app/index.html` (vanilla Home reference)
- `../app/src/features/mastery.js`

## 6. Done when

- [ ] At 1366x768, first-use or returning-user primary practice action is visible without scrolling.
- [ ] At 320 px, MetricCards and shortcuts wrap without horizontal scrolling or clipped labels.
- [ ] Returning state labels XP, streak, rank, mastery, sample standings and Supabase ELO; first-use state offers one primary action.
- [ ] A skill with no assessment displays “Unassessed”; every mastery value is labeled as a drill-based estimate.
- [ ] Profile/progress loading uses Skeletons; sync errors appear in a non-blocking AlertBanner while practice remains usable.
- [ ] Every control is keyboard reachable; progress exposes accessible name and min/max/current values.
- [ ] selectors for this feature removed from src/styles.css.
