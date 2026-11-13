# Debate room

## 1. Purpose

Give a learner a focused turn-based debate space for either AI practice or a live person-to-person match. The shared room surface must keep the motion, whose turn it is, time remaining, transcript, and send/record action immediately legible.

## 2. Current problems

- AI and live room markup/state live in separate long branches of `src/App.tsx`; transcript and controls are not a shared component.
- Argument and transcript text use Inter 15/23; headings and data need a consistent type hierarchy (`src/styles.css`).
- Timers, playback, transcript, referee feedback, and controls compete in one scrolling page; make the active-turn action dominant.
- Microphone messages cover unsupported browser, transcription, and permission failures, but there is no explicit reusable permission-state component (`src/App.tsx`).
- Some room/status literals contain mojibake punctuation in `src/App.tsx`.

## 3. Target design

- Desktop: two-column room; main column has motion, round/turn progress, a transcript that scrolls inside its own region, and a Composer pinned to the bottom of the main column; side rail has opponent/AI, clock, settings summary, and referee/status. Below 900 px, replace the side rail with a sticky compact bar at the top of the main column showing turn owner, clock, and round. Keep it visible while the transcript region scrolls; below 640 px stack controls. Pin the Composer above the on-screen keyboard on mobile and resize the transcript region to the visible viewport while the keyboard is open.
- Use Space Grotesk for motion/room heading, Inter for arguments and instructions, JetBrains Mono tabular digits for clocks, rounds, scores, and elapsed time.
- Current-turn state has an accent border and explicit “Your turn” text. Opponent/AI thinking has a static status plus short spinner; do not animate transcript content.
- Speech states: unsupported; permission pending; denied with instructions and written fallback; recording with remaining time and Stop/Cancel; processing/transcribing; ready with editable transcript and playback; transcription failure with editable manual transcript; upload/send error with retry; cancellation/timeout cleanup.
- Text states: empty transcript with clear prompt; loading opponent response; send failure preserves the user's draft; time expiry visibly advances/pass state.
- Completion states: referee pending; referee error with local estimate clearly marked; final scores and turn feedback; win/loss/tie use text, icon, and semantic color. For AI and live, show rating/XP changes only when confirmed by their source.

### Wireframe: Debate Room (desktop and mobile)

```text
DESKTOP 1366 x 768 | 240 px Sidebar
+------------------------+--------------------------------------+----------------+
| Sidebar [Surface]      | PageShell main column                | Status Card   |
| nav: Debate active     | TopBar 64 px [Text secondary / 12 px] | opponent       |
|                        | H1 motion [Space Grotesk 30/38]      |               |
|                        | ProgressBar round [Accent; Mono]      | StatusBadge    |
|                        | Transcript scroll region [Inter 15/23]| clock [Mono]   |
|                        | Composer pinned bottom: Textarea      | settings       |
|                        | mic Button + RecordingStatus + Send   |               |
+------------------------+--------------------------------------+----------------+
MOBILE 390 x 844 | Sidebar replaced by compact nav
+--------------------------------------+
| sticky compact StatusBadge bar:      |
| turn owner / clock / round [Mono]    |
| PageShell 16 px gutter               |
| motion H1; ProgressBar               |
| Transcript scroll region [Inter 15/23]|
| Composer pinned above mobile keyboard|
| Textarea + mic Button + Send Button   |
| RecordingStatus [text + icon]         |
+--------------------------------------+
STATE A: Your turn -> StatusBadge “Your turn”; composer enabled.
STATE B: Opponent thinking -> StatusBadge “Opponent thinking”; composer disabled.
Below 900 px, sticky compact bar stays atop main column while transcript scrolls.
```

## 4. Components used

- Existing: `Card`, `Button`, `Textarea`, `Badge`, Lucide icons.
- Target: shared `ProgressBar`, `StatusBadge`, `Toast`, `Card`, and `Input` (Textarea for the Composer), composed with transcript content and `RecordingStatus`; Radix Tooltip for timing details and Radix Dialog for concede/leave confirmation.

## 5. Files involved

- `src/App.tsx` (AI/live room state, timers, transcript, recording)
- `src/styles.css` (AI/live room selectors)
- `src/components/ui/button.tsx`
- `src/components/ui/textarea.tsx`
- `src/lib/supabase.ts`
- `src/lib/supabase-functions.ts`
- `../app/multiplayer.js`
- `../app/ai-debate.js`
- `../app/src/features/speech-practice.js`
- `../app/README-MULTIPLAYER.md`
- `../app/TRAINING-UPDATES.md`

## 6. Done when

- [ ] At 1366x768, topic, turn owner, clock, round, transcript and primary composer action are visible without scrolling.
- [ ] Below 900 px, a sticky compact bar at top of main column keeps turn owner, clock, and round visible while transcript scrolls.
- [ ] At 320 px, no horizontal scrolling occurs; transcript wraps and composer controls fit.
- [ ] Transcript has its own scroll region; Composer remains pinned at the main-column bottom, including with the mobile keyboard open.
- [ ] A failed send leaves the full draft in the Textarea for editing or retry.
- [ ] Win, loss, and tie each have distinct text, icon, and semantic color; color is not the only distinction.
- [ ] Your-turn, opponent-thinking, mic unsupported/denied, recording, processing, retry, timeout, referee-pending, estimated, and final states are textually distinct.
- [ ] All controls are keyboard reachable in logical order; leaving recording stops every microphone track.
- [ ] selectors for this feature removed from src/styles.css.
