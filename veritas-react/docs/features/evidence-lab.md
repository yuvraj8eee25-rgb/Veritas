# Evidence Lab

## 1. Purpose

Investigate a user-entered claim by searching both sides, reviewing sources, assessing their stance/strength, and presenting a confidence-weighted conclusion with caveats and an operational trace.

## 2. Current problems

- Search form, investigation trace, verdict, subclaims, comparison, caveats, and source cards are conditionally stacked in one component (`src/features/EvidenceLab.tsx`). Long results push key actions far down the page.
- Loading is represented by a changing phase string and trace; source count and bounded retry work need clear progress semantics.
- Empty-result/provider failures and incomplete investigation need distinguishable recovery actions; an earlier observed live run showed a generic “No sources” or Edge Function transport error, so errors should retain request context and retry guidance.
- Source excerpts and AI assessment are displayed together; the design must make original-source links and limitations easy to inspect.

## 3. Target design

- Search area stays at the top: claim text area, 500-character count, Investigate button, and short security note. The trace is a compact native <details> disclosure with current step and completed/failed markers.
- Results: verdict/confidence summary; testable subclaims; source comparison/cross-examination; caveats; source-by-source cards with stance, strength, publisher/date, finding, and original link. Use two-column source cards on wide desktop, one column below 900 px.
- States: empty prompt; invalid short claim; submitting; planning/searching/classifying/replanning; completed; no sources; provider/proxy error with request reference and retry; partial result with caveats; malformed source URL handled without crashing. Use supports/refutes/mixed/insufficient evidence language.

## 4. Components used

- Existing: `EvidenceLab`, `Card`, `Textarea`, `Button`, `Badge`, Lucide `Search`/`LoaderCircle` icons.
- Target: shared `ProgressBar`, `StatusBadge`, `AlertBanner`, and `EmptyState`, composed with feature-specific source/verdict content; use native `<details>` for the trace disclosure.

## 5. Files involved

- `src/features/EvidenceLab.tsx`
- `src/lib/supabase-functions.ts`
- `src/app/api/supabase-functions/route.ts`
- `src/components/ui/card.tsx`
- `src/components/ui/textarea.tsx`
- `src/components/ui/button.tsx`
- `src/components/ui/badge.tsx`
- `src/styles.css`
- `../app/src/features/evidence-lab.js`
- `../app/agentic-investigation.js`
- `../app/supabase/functions/assess-evidence/`
- `../app/README.md`

## 6. Done when

- [ ] At 1366x768, claim input, count and primary Investigate action are visible without scrolling.
- [ ] At 320 px, search form, AlertBanner, trace and source cards fit without horizontal scrolling; URLs wrap safely.
- [ ] Empty, invalid, searching, zero-results, partial-results, proxy/Edge error, retry and completed states have distinct status text.
- [ ] Native details expands/collapses trace by keyboard; source links and caveats are reachable in order.
- [ ] selectors for this feature removed from src/styles.css.
