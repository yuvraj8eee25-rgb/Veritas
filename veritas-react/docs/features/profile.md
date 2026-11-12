# Profile and avatar

## 1. Purpose

Show a learner's practice history, skill estimates, rank, multiplayer record, and avatar; allow display-name editing, avatar upload, match/leaderboard shortcuts, account creation, and sign-out.

## 2. Current problems

- The profile recreates the legacy layout but presents local practice metrics and Supabase ELO/record data together; their separate sources need explicit labels (`src/features/Profile.tsx`, `src/App.tsx`).
- The radar chart has text labels around a fixed SVG and can crowd narrow widths (`src/features/Profile.tsx`).
- Avatar upload, name editing, skill bars, activity heatmap, and badges are all on one long page; mobile order needs deliberate grouping.
- Some profile copy contains mojibake punctuation (`src/features/Profile.tsx`).

## 3. Target design

- Header: avatar/name/account status and actions. First metric row: XP/rank/streak and multiplayer ELO/record in separate grouped cards. Then skill assessment, recent activity, badges, and six-month heatmap.
- Clearly call skill bars “drill mastery estimates”; show “Unassessed” when data is absent. Include the date/source context for rating.
- States: profile loading; guest/local profile with create-account prompt; signed-in profile; no activity; unassessed skills; name edit/save/cancel; avatar upload/progress/error; signed URL unavailable; sign-out confirmation. Win/loss appear as record figures only.

## 4. Components used

- Existing: `ProfileScreen`, `Card`, `Button`, `Badge`, Lucide icons, inline SVG radar chart.
- Target: `ProfileHeader`, `MetricCard`, `SkillBars`, `ActivityHeatmap`, and Radix Dialog for sign-out confirmation. Use accessible descriptions for chart and heatmap.

## 5. Files involved

- `src/features/Profile.tsx`
- `src/App.tsx` (profile load, sync, avatar actions)
- `src/lib/supabase.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/styles.css`
- `../app/README-AVATAR.md`
- `../app/src/features/profile.js`

## 6. Done when

- [ ] At 1366x768, identity and first MetricCard row are visible without scrolling.
- [ ] At 320 px, stats/charts fit without horizontal scrolling; labels remain readable or switch to a list.
- [ ] Guest/local XP and mastery are distinguished from Supabase ELO/record; absent values have an explicit label.
- [ ] Name edit, avatar upload/error/loading and sign-out controls are keyboard reachable and announce status.
- [ ] selectors for this feature removed from src/styles.css.
