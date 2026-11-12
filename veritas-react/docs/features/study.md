# Study paths

## 1. Purpose

Teach argument and evidence skills through short lessons with recall, explanation, worked example, practice, reflection, spaced review, weekly goals, saved Field Notes, reminders, and links into drills/Evidence Lab/Classroom.

## 2. Current problems

- The lesson flow uses five internal stages (`recall`, `learn`, `practice`, `reflect`, `finish`) inside one component; the stage progress and lesson content compete on the same page (`src/features/Study.tsx`).
- Lessons combine choice, ordering, and reflection activities with different feedback rules; stage-specific controls need a predictable position.
- Study state is localStorage-only, keyed by current user ID or `guest`; the UI should state this storage behavior (`src/features/Study.tsx`).
- Lesson copy includes current English smart punctuation; audit strings before changing font hierarchy.

## 3. Target design

- Study home: weekly goal/progress; next lesson/review; review queue; lesson path cards; saved Field Notes; reminder setting. Put “Continue” on the next step card.
- Lesson: compact stage indicator; one task per panel; worked example presents weaker/stronger versions in two columns on desktop and stack on mobile; source links and limitations use native <details>.
- States: no lesson data/first lesson; loading local plan; review queue empty; lesson recall answer selected; practice correct/wrong/retry; ordering check success/error; reflection incomplete/checklist incomplete; completed lesson/review date; localStorage unavailable with session-only notice. Display practice completion/accuracy.

## 4. Components used

- Existing: `Study`, `Card`, `Button`, `Textarea`, progress elements, `<details>` for sources.
- Target: `Card`, `ProgressBar`, `EmptyState`, and `StatusBadge`; stage names remain a semantic list and do not define a second progress bar. Use native `<details>` for source disclosure and Radix Dialog only for confirmation.

## 5. Files involved

- `src/features/Study.tsx`
- `src/App.tsx` (Study navigation, XP, transfer and Classroom draft handoff)
- `src/features/practice-questions.ts`
- `src/lib/supabase.ts` (user identity for per-user local key)
- `src/styles.css`
- `../app/src/features/study.js`
- `../app/src/features/study-content.js`
- `../app/src/features/mastery.js`

## 6. Done when

- [ ] At 1366x768, next lesson/review and primary Continue action are visible without scrolling.
- [ ] At 320 px, lesson cards, answer controls and sources fit without horizontal scrolling.
- [ ] Recall, correct/incorrect, ordering, reflection incomplete/complete, review empty/due, storage error and completed states offer explicit next actions.
- [ ] Native details controls source disclosure by keyboard; lesson transfers preserve context and tab order is logical.
- [ ] selectors for this feature removed from src/styles.css.
