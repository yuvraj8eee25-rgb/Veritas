# Debate the AI

## 1. Purpose

Let a learner choose a motion, side, opponent style, and written or recorded-speech format; exchange turns with the AI; then review the referee result and optional Devil's Advocate drill.

## 2. Current problems

- Setup, topic browser, AI room, result, and Devil's Advocate follow-up are separate internal branches in `src/App.tsx`, not addressable routes.
- Topic browser and setup fields share the same panel, while live-topic loading/source attribution have distinct states that need stronger hierarchy (`src/App.tsx`, `src/features/debate-topics.ts`).
- Final score, local estimate, referee feedback, and Devil's Advocate response share one result view; label estimate versus official score persistently.
- Existing screen strings contain mojibake punctuation in the root component.

## 3. Target design

- Setup order: motion/topic search and source attribution; stance; opponent difficulty; turns and timing; written/speech mode; primary Start button. Keep Surprise me and random-side as secondary actions. Keep “Start debate” in a sticky footer.
- Stance, opponent style, turn count, and format are single-select radio groups rendered as segmented controls. Use native fieldsets/radio inputs; `@radix-ui/react-radio-group` is not installed, and no dependency is added.
- Topic categories are `Chip` toggle buttons with `aria-pressed`, not Tabs or Badges. Topic list is a compact searchable two-column list on desktop, one column on mobile; each live topic shows publisher and source link.
- Result order: official/estimated status, winner/tie, two scores, concise summary, per-turn feedback, then optional Devil's Advocate challenge.
- States: no topic selected; topic lookup loading/empty/error with 20 local suggestions available; setup validation; starting/loading; AI thinking; opponent error with user draft retained; referee pending; local estimate fallback; official result win/loss/tie; drill loading, scored, or error. AI result is not complete until the verdict has a final state.

### Wireframe: AI Debate setup (two states)

```text
1366 x 768 | 240 px Sidebar | 64 px top bar
+------------------------+------------------------------------------------+
| Sidebar [Surface]      | PageShell 24 px gutter                         |
| Debate active          | TopBar 64 px [Text secondary / 12 px Inter]    |
|                        | H1 “Debate the AI” [Space Grotesk 30/38]       |
|                        | Card Topic + source link [Surface]             |
|                        | Chip category filters [toggle, aria-pressed]    |
|                        | Radio segmented: stance [For / Against]         |
|                        | Radio segmented: opponent [3 styles]            |
|                        | Radio segmented: turns [3 / 5]                  |
|                        | Radio segmented: format [Written / Speech]      |
|                        | sticky footer: Button “Start debate” [Accent]   |
|                        | secondary Button “Surprise me” [Surface]        |
+------------------------+------------------------------------------------+
DEFAULT: no topic selected; topic chips and settings visible.
VALIDATION ERROR: AlertBanner [Danger] names missing topic; focus returns to Topic Input.
Primary action: Button “Start debate”.
At 320 px sidebar becomes compact navigation; Cards stack without horizontal scrolling.
Labels Inter 14/20; topic Inter 15/23. Radio groups use native fieldsets and radio inputs styled as segmented controls.
```

### Wireframe: AI Debate result

```text
1366 x 768 | 240 px Sidebar
+------------------------+------------------------------------------------+
| Sidebar [Surface]      | TopBar 64 px [Text secondary / 12 px Inter]    |
| Debate active          | H1 “Debate result” [Space Grotesk 30/38]       |
|                        | PageShell 24 px gutter [Background]             |
|                        | StatusBadge: Official / Estimated [text + mark]  |
|                        | Card winner [StatusBadge + outcome text/icon]    |
|                        | MetricCard your score | opponent score [Mono]    |
|                        | Card summary [Inter 15/23]                       |
|                        | per-turn feedback [Table/Rows; StatusBadge]      |
|                        | optional Card Devil’s Advocate [Button]          |
+------------------------+------------------------------------------------+
ESTIMATED: Estimated StatusBadge and caveat remain beside winner and scores.
OFFICIAL: Official StatusBadge labels the referee result.
Result states: win, loss, tie; each includes distinct text, icon, and color.
```

## 4. Components used

- Existing: `Card`, `Button`, `Input`, `Textarea`, topic data in `debate-topics.ts`.
- Target: shared `Chip`, `TopicPicker`, `ChoiceGroup`, `TurnCountPicker`, and `ResultSummary`; use native radio groups styled as segmented controls for stance, opponent style, turns, and format. Use Radix Dialog for destructive exit confirmation.

## 5. Files involved

- `src/App.tsx`
- `src/features/debate-topics.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/components/ui/textarea.tsx`
- `src/lib/supabase-functions.ts`
- `src/styles.css`
- `../app/ai-debate.js`
- `../app/supabase/functions/ai-debate/`
- `../app/README-MULTIPLAYER.md`

## 6. Done when

- [ ] Start is always visible; topic, stance and format are reachable without leaving the page.
- [ ] Topic categories are Chip toggle buttons with working `aria-pressed`; selected state is distinguishable without color alone.
- [ ] Stance, opponent, turns, and format each expose a labeled, keyboard-operable single-select radio group.
- [ ] At 320 px, setup/result have no horizontal scrolling and topic titles wrap.
- [ ] Default/invalid setup, topic loading/empty/error, AI thinking, retained-draft error, referee pending, estimate, verdict and drill-result states expose a named next action.
- [ ] All interactive elements are keyboard reachable; live topic source links open the attributed source.
- [ ] selectors for this feature removed from src/styles.css.
