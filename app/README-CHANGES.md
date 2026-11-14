# What changed

## New files
- `public/design.css` shares design tokens, surfaces, and interaction states across the app and its public pages.
- `arcade.css` / `arcade.js` — combo chains, daily goals, achievements,
  and the juice effects. `arcade.js` loads **before** `app.js` and
  exposes `window.Arcade`.

## Edited files
- `index.html` — added two stylesheet links and one script tag; added the
  combo HUD, the debate cards, and the daily-goals container; reordered
  the sidebar; rewrote copy throughout.
- `app.js` — seven added calls into `window.Arcade`, in `defaultState`,
  `selectAnswer`, `startGame`, `showFeedback`, the feedback-next handler,
  `finishGame`, and `renderHome`. Search for `Arcade.` to find them all.

## Unchanged
`styles.css`, `multiplayer.js`, `ai-debate.js`, `avatar.js`,
`agentic-investigation.js`, `supabase-config.js`, `appwrite-config.js`,
and everything under `supabase/`.

## Running it
Open `index.html` in a browser. No build step, same as before.

## Note on app.js
It has mixed line endings (CRLF with some bare LF). If you patch it with
a script, read and write with `newline=''` so the endings survive.
