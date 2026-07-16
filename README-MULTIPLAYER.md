# Multiplayer setup

New files added to your app:

| File | Purpose |
|---|---|
| `firebase-config.js` | Firebase init + anonymous sign-in |
| `multiplayer.js` | Lobby, hot topics, matchmaking, debate room |
| `functions/index.js` | Scheduled job that asks Claude for daily topics + queue cleanup |
| `firestore.rules` / `firestore.indexes.json` | Security + required index |

`index.html`, `styles.css`, and `app.js` were edited in place (a "Multiplayer"
icon in the top bar + a battle card on Home, two new screens, and a small
`window.DA` bridge at the end of `app.js` so `multiplayer.js` can reuse
`toast`, `showScreen`, and award XP).

## 1. Create the Firebase project

1. https://console.firebase.google.com → **Add project**.
2. In the project, enable:
   - **Authentication** → Sign-in method → **Anonymous** (turn it on).
   - **Firestore Database** → Create database → production mode.
3. Project settings → **Your apps** → **Add app** → Web. Copy the config
   object it gives you into `firebase-config.js` (replace the `YOUR_...`
   placeholders).

## 2. Deploy Firestore rules + index

```bash
npm install -g firebase-tools
firebase login
firebase init   # select this project, skip re-scaffolding files you already have
firebase deploy --only firestore:rules,firestore:indexes
```

The first live matchmaking query will otherwise fail with a "requires an
index" error — the file above pre-creates it, so it works from turn one.

## 3. Deploy the automation (Cloud Functions)

```bash
cd functions
npm install
cd ..
firebase functions:secrets:set ANTHROPIC_API_KEY
# paste your Anthropic API key when prompted
firebase deploy --only functions
```

That's the automation: `generateHotTopics` is a **scheduled function**
(`onSchedule("0 5 * * *")`) — Firebase provisions the Cloud Scheduler job for
you on deploy, no separate cron setup needed. Every day at 05:00 UTC it:

1. Calls the Claude API with a prompt asking for 6 current, debate-worthy
   topics as JSON.
2. Writes them to `hotTopics/{YYYY-MM-DD}` in Firestore.
3. The app just reads that day's document — no function call happens at
   read time, so the lobby loads instantly.

To generate today's topics immediately instead of waiting for 5am, call the
second function once after deploying:

```bash
curl https://REGION-PROJECT_ID.cloudfunctions.net/generateHotTopicsNow
```

(URL is printed by `firebase deploy`.) A static 6-topic fallback list is
baked into `multiplayer.js` too, so the lobby never looks empty even before
the first run or if a day's generation fails.

`cleanupStaleQueue` runs every 5 minutes and deletes queue entries older
than 5 minutes, so someone who searched and closed the tab doesn't stay
"waiting" forever and get matched hours later.

## 4. Serve the app

```bash
firebase deploy --only hosting
```

or just keep serving the static files however you already do — Firebase
only needs to host the *backend* pieces (Firestore + Functions); the
front-end files work from any static host as long as `firebase-config.js`
points at the right project.

## How matchmaking works (no server round-trip needed)

- Tapping **Find Match** writes a `matchQueue/{uid}` doc with the chosen
  topic (or none) and starts listening to that same doc.
- Every few seconds, the client looks for someone else's `waiting` doc and,
  if found, runs a Firestore **transaction** that creates the `debates/{id}`
  room and flips both queue docs to `matched` — whichever client's
  transaction wins does the pairing for *both* players; each learns about
  it through their own doc's listener.
- Retried automatically if two people try to grab the same opponent at once
  (transaction just re-runs).

This keeps the whole thing serverless. For a larger app you'd eventually
want matching to happen inside a Cloud Function instead of the client (so
you can rate-limit, prevent abuse, and match on skill/rank) — the current
rules intentionally stay permissive on `matchQueue` writes to support the
client-side version; tighten them if you move matching server-side.

## Debate flow

- Turn-based, 3 arguments per player (`maxTurnsPerPlayer` in
  `multiplayer.js` — change the constant to adjust).
- Turn order = whoever was waiting first goes first.
- All state lives in one `debates/{id}` document; both clients subscribe
  with `onSnapshot`, so turns appear live with no polling.
- On completion, each player can thumbs up/down the other's argument
  (`ratings.{uid}` on the debate doc) and gets +60 XP locally.

## Known limitation

If a player closes the tab mid-debate, their opponent is left waiting on
"Opponent's turn" with nothing timing them out. A quick v2 addition: store
`lastTurnAt` on the debate doc and add a scheduled function (like
`cleanupStaleQueue`) that marks debates `status: "completed"` (or
`"abandoned"`) if no turn has landed in, say, 10 minutes — the client
already handles any `status !== "active"` by showing the end panel, so no
front-end change would be needed.
