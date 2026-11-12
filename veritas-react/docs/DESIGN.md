# Veritas Design System

## Direction and scope

Design Veritas as a dark, flat, data-forward debate and critical-thinking workspace. Use Polymarket as a reference for restrained information hierarchy, not its branding or trading metaphors. Desktop is the primary canvas; screens must remain usable at tablet and phone widths.

This is the redesign target, not a claim that the current React app already follows it. The palette is a starting point and must be validated visually in-browser before implementation.

## Audited screens

The React app currently renders its screens as internal view states from `src/App.tsx`, mounted by `src/app/client-app.tsx` at `/`; it does not currently have a URL route per screen. The route handlers are `/api/health` (GET) and `/api/supabase-functions` (POST). `public/demo/index.html` is a static demo, not a React route.

The sibling vanilla `../app/index.html` includes splash, home, mode select, game, summary, profile, leaderboard, daily, multiplayer, debate room, AI debate, AI debate room, investigation, Study, Classroom, and auth screens. Its visible features include four drill formats, XP/ranks/streaks, daily goals/combos/achievements, avatars, ELO, AI and person-to-person debates, public matchmaking/private rooms, recorded speech, evidence investigation, Study, Classroom, install/offline support, and `../app/public/about.html`. The React app also has the static club demo under `public/demo/`.

## Color tokens and contrast

These colors are based on values in `src/styles.css`; the translucent line color is normalized to a solid quiet border. Ratios use the WCAG relative-luminance formula and are rounded to two decimals.

| Token | Hex | Use |
| --- | --- | --- |
| Background | `#080D18` | Page canvas and focus-ring offset. |
| Surface | `#0D1622` | Cards, input wells, table rows. |
| Surface raised | `#142130` | Menus, selected rows, popovers. |
| Border | `#263344` | Quiet separators and card outlines only. |
| Border strong | `#5D718A` | Input, select, button, and interactive boundaries. |
| Text primary | `#EEF2F8` | Headings and primary copy. |
| Text secondary | `#AEB9CA` | Supporting text and labels. |
| Text muted | `#7D8CA1` | Metadata that is not an essential instruction. |
| Accent | `#77DFC1` | Primary actions, progress, focus, selected state. |
| Success | `#72D7A0` | Correct and completed state. |
| Danger | `#F08080` | Errors, destructive actions, negative outcomes. |
| Warning | `#F0CA7D` | Pending, due, and time-pressure state. |
| Information | `#87B6EF` | Neutral notices and source metadata. |

| Text/foreground token | On Background `#080D18` | On Surface `#0D1622` | On raised `#142130` | Normal-text AA |
| --- | ---: | ---: | ---: | --- |
| Primary `#EEF2F8` | 17.29:1 | 16.18:1 | 14.49:1 | Pass |
| Secondary `#AEB9CA` | 9.80:1 | 9.17:1 | 8.21:1 | Pass |
| Muted `#7D8CA1` | 5.68:1 | 5.31:1 | 4.76:1 | Pass |
| Accent `#77DFC1` | 12.13:1 | 11.35:1 | 10.16:1 | Pass |
| Success `#72D7A0` | 11.05:1 | 10.34:1 | 9.26:1 | Pass |
| Danger `#F08080` | 7.50:1 | 7.02:1 | 6.28:1 | Pass |
| Warning `#F0CA7D` | 12.44:1 | 11.64:1 | 10.43:1 | Pass |
| Information `#87B6EF` | 9.22:1 | 8.63:1 | 7.73:1 | Pass |

`Border`/Surface is **1.42:1**, below the 3:1 non-text contrast target; it must not be the sole visible boundary for an input or interactive control. `Border strong`/Surface is **3.63:1**, Background is **3.88:1**, and raised Surface is **3.25:1**, all meeting 3:1. Every text/background pair listed above meets WCAG AA 4.5:1 for normal text.

### Button states and focus

Use a 2 px Accent focus ring with a 2 px Background offset; Accent/Background is 12.13:1. Preserve text/icon and keyboard focus in pressed states.

| Variant | Default | Hover | Pressed | Disabled |
| --- | --- | --- | --- | --- |
| Primary | `#77DFC1` / `#092019` | `#92ECD1` / `#092019` | `#59B99E` / `#092019` | `#263344` / `#AEB9CA` |
| Secondary | `#0D1622` / `#EEF2F8`, Border strong | `#142130` / `#EEF2F8` | `#1C2D40` / `#EEF2F8` | `#0D1622` / `#7D8CA1`, Border |
| Tertiary/ghost | transparent / `#AEB9CA` | `#142130` / `#EEF2F8` | `#1C2D40` / `#EEF2F8` | transparent / `#7D8CA1` |
| Destructive | `#F08080` / `#251114` | `#F49B9B` / `#251114` | `#D96A6A` / `#251114` | `#263344` / `#AEB9CA` |

Primary text contrast on default/hover/pressed fills is 10.64:1 / 12.29:1 / 7.19:1. Destructive text contrast is 6.93:1 / 8.56:1 / 5.32:1. Disabled text on `#263344` is 6.46:1. Secondary and tertiary foregrounds use the ratios above.

### Rank and ELO tier colors

The six XP rank names are present in `src/App.tsx`. Each color is paired with its label and Roman-numeral mark; color is supplemental. React currently shows numeric ELO without tier thresholds, so display ELO as a number only until the product defines those thresholds.

| Mark | Existing XP rank | Color | Contrast on Surface |
| --- | --- | --- | ---: |
| I | Novice Debater | `#7D8CA1` | 5.31:1 |
| II | Rising Arguer | `#D6A979` | 8.49:1 |
| III | Skilled Rhetorician | `#B8C5D4` | 10.37:1 |
| IV | Logic Tactician | `#F0CA7D` | 11.64:1 |
| V | Master Orator | `#87B6EF` | 8.63:1 |
| VI | Grandmaster of Rhetoric | `#72D7A0` | 10.34:1 |

## Typography

| Role | Typeface | Size / line height | Weight |
| --- | --- | --- | --- |
| Display | Space Grotesk | 36 / 42 px | 600 |
| H1 | Space Grotesk | 30 / 38 px | 600 |
| H2 | Space Grotesk | 22 / 30 px | 600 |
| H3 | Space Grotesk | 18 / 26 px | 600 |
| Body, argument, transcript | Inter | 15 / 23 px | 400 |
| Control | Inter | 14 / 20 px | 500 |
| Small | Inter | 12 / 18 px | 400 |
| Eyebrow | Inter | 11 / 14 px | 600; 0.08em tracking |
| Score, clock, data | JetBrains Mono | 13 / 18 px | 500; tabular numerals |

Load Space Grotesk, Inter, and JetBrains Mono with built-in `next/font/google` or `next/font/local` if local files are supplied. Do not add a font package. Inter is the only font currently bundled; the other two are redesign targets until implemented.

## Layout and geometry

- Spacing scale: 4, 8, 12, 16, 24, 32, 40, 48, 64 px; a **4 px base grid**.
- Radii: 6 px compact chip, 8 px input/select, 10 px button, 12 px card, 16 px large panel; pill only for status badges.
- Desktop shell target: 240 px sidebar, 64 px top bar, 24 px content gutter, 1,360 px maximum content width. Forms max out at 560 px.
- Breakpoints: 320, 640, 900, and 1,280 px.
- Icon sizes: 16 px compact metadata, 20 px standard controls, 24 px primary navigation/empty state.
- Keep data columns aligned and numeric values tabular. Avoid oversized empty hero regions above task-focused screens.

## Shared components

| Component | Specification |
| --- | --- |
| Button | 44 px default height; 36 px compact height for leaderboard rows/classroom tables; 10 px radius; 12-16 px horizontal padding. Use the state tokens above. Include focus-visible, disabled, and loading; loading preserves width. |
| Card | Surface, 1 px Border, 12 px radius, 20 px padding; no gradient or resting shadow. Selected cards use Border strong and a faint Accent tint. |
| MetricCard | Surface, 1 px Border, 12 px radius, 16 px padding; 12 px secondary Inter label, 24 px JetBrains Mono value, optional delta/status. Keep units and comparison period visible. |
| Input | 44 px minimum height; Surface, 1 px Border strong, 8 px radius, 14 px Inter. Focus uses specified ring. Errors include message/icon and `aria-describedby`; textarea has 12 px padding and 1.5 line height. |
| Modal | Radix Dialog; max-width 560 px, 24 px padding, 12 px radius, raised Surface; `#0009` overlay and `0 16px 40px #0006` shadow. Trap focus, support Escape, restore trigger focus; full-width actions below 640 px. |
| Tabs | Radix Tabs; 40 px minimum trigger, active 2 px Accent underline, visible focus ring, arrow-key navigation. Selection is not color-only. |
| Badge | 22 px minimum height, 8 px horizontal padding, pill radius, 11 px Inter; JetBrains Mono for numbers. Use a text label and optional semantic icon/color. |
| Chip | Toggle Button, 32 px minimum height, 8 px horizontal padding, 6 px radius, 12 px Inter. Expose selected state with `aria-pressed`; use Border strong or Accent tint plus a check/marker so selection is not color-only. |
| Sidebar | 240 px desktop rail, 16 px inner gutter, 40 px nav rows, 8 px radius. Active row uses raised Surface, Accent text, 2 px leading marker. At narrow widths use compact navigation and More. |
| PageShell | Background canvas, sidebar/top bar/content; 24 px content gutter and section gap, 1,360 px max width. Loading/error content keeps geometry stable. |
| Toast | Bottom-right within PageShell, max-width 420 px, 12 px padding, 10 px radius. StatusBadge/icon, concise message, close control. Auto-dismiss at 5 s; pause on hover/focus; errors persist. Announce through an appropriate live region. |
| AlertBanner | Full-width inline block above related content; 12 px padding, 8 px radius, 1 px semantic border. Icon, title, message, optional action/dismiss. Errors use `role="alert"`; info uses `role="status"`. |
| EmptyState | Centered in its content area, max-width 420 px, 24 px icon, H3, body, one primary action. Illustration optional. |
| Skeleton | Match final geometry using static `#142130` blocks; optional one-time 160 ms fade; no indefinite shimmer. Mark `aria-hidden` unless paired with a "Loading..." status. |
| ProgressBar | Horizontal shared progress; 4 px track/fill, 8 px only for primary training progress. Visible label/value or accessible name, min/max/current values, optional time/turn annotation. |
| StatusBadge | 22 px minimum-height pill, mark/icon plus text, semantic token; never color alone. Use for publication, waiting/active, stance, and outcome. |
| Avatar | 32 px dense row, 40 px default, 64 px profile; circular crop, 1 px Border strong outline, accessible initials/icon fallback. Rank and turn ownership are not color-only. |
| Select | Radix Select; 44 px minimum, Surface, Border strong, 8 px radius, 14 px Inter. Selected value, chevron, disabled/error/focus states, keyboard navigation/typeahead, visible option labels. |
| Tooltip | Radix Tooltip; 180 ms open delay, 6 px offset, max-width 240 px, 12 px Inter. Keyboard-focusable trigger; supplements a label. |
| Table | Semantic table with visible column headers, 44 px rows, 12 px cell padding, tabular/mono numeric columns, raised-Surface row hover. Compact actions use 36 px Buttons. Below 640 px each row becomes a labeled card; no horizontal scrolling. |

## Canonical shared-component glossary

Build these once in Step 0 under `src/components/ui/` (or its shared composition layer). Feature specs use these names and do not redefine them.

- `ProgressBar` replaces `QuestProgress`, `QuestionProgress`, `RoundProgress`, and the bar parts of `StageStepper`.
- `MetricCard`, `EmptyState`, `StatusBadge`, `Toast`, `Skeleton`, and `Table` are canonical shared components.
- Other canonical primitives: `Button`, `Card`, `Input`, `Modal`, `Tabs`, `Badge`, `Chip`, `Sidebar`, `PageShell`, `AlertBanner`, `Avatar`, `Select`, and `Tooltip`.
- Feature specs may compose these components; feature-only pieces may be named only when no glossary item applies.

## Motion

- Hover/focus feedback: 120-160 ms ease-out; color/border change or at most 1 px translation.
- Progress and selection changes: 160-200 ms.
- Modal/section entrance: 180-240 ms opacity/translation only; no spring bounce or looping decoration.
- Correct-answer feedback may use one 180 ms emphasis. Win/loss feedback uses a static result mark/color plus score change, not default confetti.
- Under `prefers-reduced-motion: reduce`, remove nonessential motion; state remains clear without animation.

## CSS rule

Tailwind utilities only. Tokens live as CSS variables in `src/styles.css` (or a new `src/tokens.css`). No new CSS modules. Each redesigned feature moves its selectors out of the monolithic stylesheet and deletes the old rules.

## Visual references

Home, Debate Room, Auth, and AI Debate setup have ASCII wireframes in their feature specs (Phase 3). The palette is a starting point to be validated visually.

