# Live multiplayer

## 1. Purpose

Match two signed-in learners for a turn-based debate, or let them meet in a private invite room. Provide live turn state, a clock, speech option, referee result, ratings, and rematch path.

## 2. Current problems

- Lobby, search, private-room code handling, and live room are separate branches in `src/App.tsx`; there is no route URL for restoring a match after navigation.
- Matchmaking waits/polling, queue errors, private code/expiry, and active debate all use the same root shell and need distinct progress states.
- The scoreboard has multiple data points (ELO, turn clock, cumulative thinking time, round progress); compact existing labels need the mono/data hierarchy from `../DESIGN.md`.
- Speech permission/upload messages are inline state strings, not a reusable permission/error panel.

## 3. Target design

- Lobby form: motion picker and publisher attribution, written/speech selector, turns, speech length, then Find Match and secondary Create Private Room.
- Match search: central animated indicator only if motion is enabled; show elapsed search and a Cancel action. Empty/timeout offers retry, change settings, or private room.
- Private room: code is high contrast, copyable, with waiting/guest-joined/expired/closed states and an explicit leave action.
- Live room uses the shared layout in `debate-room.md`; show both players, ratings, active turn, round count, server-time clock, cumulative time, and per-turn elapsed time.
- After completion, show one optional “Good match / Poor match” response. Keep it separate from the AI referee score and ELO result.
- States: not signed in; queue loading; no opponent/queue error; room waiting/full/expired; room loading; active turn/other player's turn; recording permission states; submit retry; turn timeout; referee pending/error/estimated; completed win/loss/tie; rating refresh and XP grant. Never show an estimated referee score as official.

## 4. Components used

- Existing: `Button`, `Card`, `Input`, `Textarea`, `Badge`, `Separator`.
- Target: shared `MatchSetup`, `PrivateRoomCode`, `MatchSearchStatus`, `PlayerScoreboard`, and `RatingDelta`; Radix Dialog for leave/concede confirmation.

## 5. Files involved

- `src/App.tsx`
- `src/lib/supabase.ts`
- `src/lib/supabase-functions.ts`
- `src/components/ui/button.tsx`
- `src/components/ui/card.tsx`
- `src/components/ui/input.tsx`
- `src/styles.css`
- `../app/multiplayer.js`
- `../app/supabase/migrations/0015_training_and_speech.sql`
- `../app/supabase/migrations/0016_leave_training_queue.sql`
- `../app/README-MULTIPLAYER.md`
- `../app/TRAINING-UPDATES.md`

## 6. Done when

- [ ] At 1366x768, lobby settings, primary Find Match action, and state feedback are visible without scrolling.
- [ ] At 320 px, lobby, private-room code, scoreboard, and result fit without horizontal scrolling.
- [ ] Written/speech settings, private-room waiting/joined/closed/expired, and public queue searching/error/cancel states have distinct visible StatusBadge/AlertBanner feedback.
- [ ] Live room always shows both players, turn owner, clock, ProgressBar, and primary action; below 900 px the sticky compact turn/clock/round bar remains visible while transcript scrolls.
- [ ] Timeout, submit retry, referee pending/error/estimate/final, rating refresh, and XP award states are separately labeled; keyboard reaches each control in logical order.
- [ ] selectors for this feature removed from src/styles.css.
