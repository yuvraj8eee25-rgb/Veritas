# Club workflow preview

## 1. Purpose

Show a sample student-to-coach debate-practice workflow without requiring an account or server-backed Classroom data.

## 2. Current problems

- The preview is a standalone static page under `public/demo/`, separate from React's app shell and global styles.
- Its copy explicitly says sample content and browser-only state; it must not be mistaken for a real Classroom submission (`public/demo/index.html`, `public/demo/demo.js`).
- The long walkthrough has three student steps and a coach overview on one page; step status and sample-data provenance must persist visually during switching.
- The static HTML currently contains mojibake punctuation in visible copy.

## 3. Target design

- Retain a compact preview banner (“Sample data · saved in this browser”) and a clear link back to Veritas.
- Student flow: build claim/evidence/reasoning; answer a fixed counterargument; review structure and reflection. Coach flow: show the sample learner's submitted draft, status, suggested next practice, and coach note.
- Use the shared design tokens but keep this low-risk demo visually distinct with a “Preview” badge. Do not suggest that source verification or grading is live.
- States: initial editable sample; step validation error; step complete; review with 0–3 structure elements; coach view before/after student completion; note saved in current preview; reset.no automatic grade is computed.

## 4. Components used

- Current standalone HTML controls and CSS; not React shared primitives.
- Target: shared token values, progress stepper, form controls, status badge, and review rows. If converted to React later, use `Button`, `Card`, and `Input` from `src/components/ui/`.

## 5. Files involved

- `public/demo/index.html`
- `public/demo/demo.js`
- `public/demo/demo.css`
- `../app/index.html` (Home link reference)
- `../app/public/demo/index.html`
- `../app/public/demo/demo.js`
- `../app/public/demo/demo.css`

## 6. Done when

- [ ] At 1366x768, current student step, sample provenance, progress and primary action are visible without scrolling.
- [ ] At 320 px, student/coach content fits with no horizontal scrolling.
- [ ] Validation, step complete, review, coach view, save, reset and incomplete-review states are visible and keyboard reachable.
- [ ] Every sample result says sample/browser-only; no live grading or Supabase persistence is implied.
- [ ] selectors for this feature removed from src/styles.css.
