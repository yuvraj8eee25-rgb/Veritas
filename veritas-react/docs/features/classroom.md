# Classroom

## 1. Purpose

Support coach/student cohorts: organizations, invitations and roles; assignments and templates; assigned drills/debates; submissions and rubric feedback; attachments; announcements, discussions, moderation, read receipts, and participation/drill analytics.

## 2. Current problems

- `src/features/Classroom.tsx` contains many workspace sections, forms, role-based controls, dialogs, and async actions in one component; navigation between organizations, assignments, grading, and discussion needs a consistent information architecture.
- A number of loading/empty/error states are inline text and per-section classes, rather than shared patterns (`classroom-react-loading`, `classroom-react-empty`, form messages).
- Organization, cohort, invite, assignment, rubric, and submission metadata create dense rows; coach actions and student actions must remain role-scoped and not be visually conflated.
- Some invitation/discussion status strings contain mojibake punctuation (`src/features/Classroom.tsx`).

## 3. Target design

- Workspace header: organization/cohort selector, role badge, and context-specific primary action. Use tabs for Overview, Assignments, People, and Discussion; Coach-only analytics/grading appears only when authorized.
- Assignment list rows show title, status, due date, kind, attempts, and one primary action. Editors separate instructions, activity settings, due/late policy, attachment/reply policy, attempts, and rubric.
- Coach grading view separates student work, rubric criteria, draft feedback, and publish action. Student view shows submission status, rubric/feedback, attachment links, and discussion state.
- States: no organizations/cohorts; loading; join/create/invite validation; invite pending/accepted/expired/revoked/error; draft/published/archived assignment; no submission; submitted; grading draft/published; due/late/attempt limit; attachment upload/size/type error/signed-download error; discussion empty/closed/moderated; assignment launch in progress; automatic submission retry; analytics empty/error. Win/loss are only shown inside assigned debate result, not Classroom chrome.

## 4. Components used

- Existing: `Button`, `Card`, `Input`, `Textarea`, `Badge`, tables and semantic forms.
- Target: Radix Tabs for workspace sections; Radix Dialog for create/edit/delete/archive/invite confirmation; shared `Table`, `StatusBadge`, and `EmptyState`, composed with feature-specific assignment, rubric, and submission content.

## 5. Files involved

- `src/features/Classroom.tsx`
- `src/App.tsx` (launch drill/debate and save Classroom results)
- `src/lib/supabase.ts`
- `src/lib/supabase-functions.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/styles.css`
- `../app/classroom.js`
- `../app/src/features/classroom.js`
- `../app/README-CLASSROOM.md`
- `../app/TRAINING-UPDATES.md`

## 6. Done when

- [ ] At 1366x768, active workspace section and role-appropriate primary action are visible without scrolling.
- [ ] At 320 px, assignment/roster rows collapse to labeled cards without horizontal scrolling or lost fields.
- [ ] Coach/student controls are role-correct; invitation, assignment, submission, grading, upload, discussion and retry states have distinct status.
- [ ] Keyboard traversal is visual-order; drafts, publish actions and private files expose status.
- [ ] selectors for this feature removed from src/styles.css.
