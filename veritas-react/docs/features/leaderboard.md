# Leaderboards

## 1. Purpose

Let learners compare practice XP and live multiplayer rating while understanding which standings are personal/demo data and which come from Supabase.

## 2. Current problems

- XP and ELO are switched by buttons inside one view, and the XP list is sample data (`src/App.tsx`).
- The current screen has loading and error messages, but sample/live provenance must remain prominent after switching tabs.
- The screen is a root-app view rather than a shareable URL (`src/App.tsx`).

## 3. Target design

- Page header with short explanation; Radix Tabs with “Practice XP” and “Live ELO.” Use a compact ranked table with rank, name, score, and record. Keep the signed-in user's row pinned or highlighted without replacing rank order.
- Use JetBrains Mono with tabular numerals for rank, XP, ELO, wins, and losses. Clearly mark seeded XP rows as sample and identify live ELO as Supabase data.
- States: loading skeleton; empty live ratings with a first-match action; query error with retry; sample XP always marked; current user absent from the visible top rows with a separate “Your standing” row if available. Win/loss appear as record counts, not page-level banners.

## 4. Components used

- Existing: `Button`, `Card`, `Badge`, Lucide icons.
- Target: Radix Tabs, shared `Table`, `MetricCard`, `StatusBadge`, and `EmptyState`; rank is a labeled table cell, not a second table primitive.

## 5. Files involved

- `src/App.tsx` (leaderboard query/view)
- `src/lib/supabase.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/badge.tsx`
- `src/styles.css`
- `../app/index.html` (legacy leaderboard section)
- `../app/multiplayer.js` (rating flow)

## 6. Done when

- [ ] At 1366x768, Radix Tabs, table header, first ranked row and user standing are visible without scrolling.
- [ ] Practice XP / Live ELO tabs switch by keyboard; active tab is announced and column headers are semantic.
- [ ] At 320 px, each Table row becomes a labeled card without horizontal scrolling or lost fields.
- [ ] Loading, empty, query error/retry, sample XP and live ELO each show status and provenance.
- [ ] selectors for this feature removed from src/styles.css.
