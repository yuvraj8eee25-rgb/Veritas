# Daily challenge and arcade

## 1. Purpose

Encourage a short repeat practice habit with a daily four-question sprint, rotating drill mode, 3x XP reward, daily goals, combo tracking, and achievement unlocks.

## 2. Current problems

- Daily challenge and arcade goals are surfaced in Home and separate view/component code (`src/App.tsx`, `src/features/ArcadeDashboard.tsx`), so reward messaging can be detached from the completed action.
- XP multipliers and completion copy include mojibake punctuation in `src/App.tsx`.
- Completion is limited once per UTC day; the reset and reward rule need visible, consistent explanation (`startDailyChallenge` in `src/App.tsx`).

## 3. Target design

- Home card shows today's mode, 4-question count, 3x multiplier, completion state, and time until reset. Goals show concise progress, reward, and completion check.
- Use flat progress bars; animate progress once on completion within 180 ms. Do not make combo count more prominent than question or time state.
- States: not started; loading question set; in progress; completed with XP/reward summary; already completed today with next reset; empty goal list; goal loading/error if unavailable. Correct/incorrect question states are covered by `solo-drills.md`.

## 4. Components used

- Existing: `ArcadeDashboard`, `Card`, `Button`, `Badge`, `Flame`/`Zap` icons.
- Target: shared `Card`, `ProgressBar`, `StatusBadge`, and `Toast`.

## 5. Files involved

- `src/App.tsx`
- `src/features/ArcadeDashboard.tsx`
- `src/features/arcade.ts`
- `src/features/practice-questions.ts`
- `src/styles.css`
- `../app/arcade.js`
- `../app/arcade.css`
- `../app/README-CHANGES.md`

## 6. Done when

- [ ] At 1366x768, mode, four-question count, 3x reward, reset time and primary action are visible without scrolling.
- [ ] At 320 px, daily card, goal rows and reward state fit without horizontal scrolling.
- [ ] Not-started, in-progress, completed, empty-goal, loading and error states show explicit progress and next action.
- [ ] Reward is announced once and daily completion cannot award twice for a UTC date.
- [ ] selectors for this feature removed from src/styles.css.
