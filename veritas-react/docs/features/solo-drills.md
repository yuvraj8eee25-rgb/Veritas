# Solo drills

## 1. Purpose

Train four specific reasoning skills through short, scored question sets: Fallacy Hunter, Rebuttal Practice, Quick Drills, and Steelman Challenge.

## 2. Current problems

- Setup, question, feedback, and summary are branches in `src/App.tsx`; question banks are separate files but screen flow is tightly coupled to root state.
- Difficulty, question count, combo, timer, explanation, coaching tip, score, XP, and mastery compete for space in the same compact panel (`src/styles.css`).
- Question heading and several feedback strings contain mojibake in `src/App.tsx`; one duplicated quote wrapper was present and should not be reintroduced.
- Mastery is an estimate derived from distinct drill assessments, not a broad measure of debate ability (`../app/src/features/mastery.js`, `../app/TRAINING-UPDATES.md`).

## 3. Target design

- Setup: four mode cards with one-sentence skill description; difficulty chips; count and XP preview; start action. Quick Drills advertises its five-second limit before entry.
- Game: progress bar and “Question n of N”; difficulty badge; readable prompt; full-width answer rows; score/combo and timer kept secondary. After selection, lock answers and show correct/wrong state plus explanation and tip.
- Summary: accuracy, score, streak, XP, mastery change, missed-question review, retry-hard and Home actions.
- States: no eligible questions; start/loading; unanswered; correct/wrong; Quick Drill countdown/time-out; saving assigned result/retry if launched from Classroom; results complete. Use correct/incorrect and run-complete language.

## 4. Components used

- Existing: `Button`, `Card`, `Badge`, CSS progress element, Lucide icons, `practice-questions.ts`, `fallacy-questions.ts`.
- Target: shared `ProgressBar` and `StatusBadge`, composed with feature-specific answer/feedback/summary content.

## 5. Files involved

- `src/App.tsx`
- `src/features/practice-questions.ts`
- `src/features/fallacy-questions.ts`
- `src/features/arcade.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/styles.css`
- `../app/app.js`
- `../app/src/features/practice-state.js`
- `../app/src/features/mastery.js`
- `../app/TRAINING-UPDATES.md`

## 6. Done when

- [ ] At 1366x768, setup Start action and, during a run, question and answers are visible without scrolling.
- [ ] At 320 px, prompt and all answer rows fit without horizontal scrolling.
- [ ] All four formats expose setup, timer/progress, correct/incorrect, timeout, loading/empty and summary states.
- [ ] Keyboard reaches each answer and next action in order; feedback is announced and progress exposes current value.
- [ ] selectors for this feature removed from src/styles.css.
