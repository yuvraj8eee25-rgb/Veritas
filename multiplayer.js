/* =========================================================
   DEBATEARENA — Multiplayer (Firestore)
   Loaded after app.js + firebase-config.js.
   Talks to app.js only through the window.DA bridge.
   ========================================================= */
(function () {
"use strict";

const FALLBACK_TOPICS = [
  { text: "Should social media platforms verify every user's real identity?", tag: "Tech" },
  { text: "Should artificial intelligence be granted any form of legal personhood?", tag: "Tech" },
  { text: "Should companies be legally required to disclose how their algorithms work?", tag: "Tech" },
  { text: "Should countries adopt a universal basic income?", tag: "Economics" },
  { text: "Is it better to rent or buy a home in today's economy?", tag: "Economics" },
  { text: "Should billionaires be allowed to exist, or should wealth be capped?", tag: "Economics" },
  { text: "Should university education be free for everyone?", tag: "Policy" },
  { text: "Should voting be mandatory for all eligible citizens?", tag: "Policy" },
  { text: "Should countries open their borders more freely to immigration?", tag: "Policy" },
  { text: "Is it ethical to eat meat in a world with viable alternatives?", tag: "Ethics" },
  { text: "Is it ethical for companies to use AI to screen job applicants?", tag: "Ethics" },
  { text: "Should zoos exist, or do they do more harm than good?", tag: "Ethics" },
  { text: "Is a four-day work week better for society than a five-day week?", tag: "Society" },
  { text: "Should social media have a minimum age requirement stricter than today's?", tag: "Society" },
  { text: "Should countries ban single-use plastics even if it raises consumer costs?", tag: "Society" },
  { text: "Is space exploration a good use of public funding right now?", tag: "Science" },
  { text: "Should governments require vaccine passports during pandemics?", tag: "Science" },
  { text: "Should genetic engineering of human embryos be allowed to prevent disease?", tag: "Science" },
  { text: "Is it ethical to bring children into a world facing climate change?", tag: "Environment" },
  { text: "Is nuclear energy the best solution to the climate crisis?", tag: "Environment" },
  { text: "Should businesses be legally required to offset their carbon emissions?", tag: "Environment" },
  { text: "Do standardized tests actually measure student ability fairly?", tag: "Education" },
  { text: "Should schools teach students how to manage personal finances?", tag: "Education" },
  { text: "Should homework be eliminated in favor of project-based learning?", tag: "Education" },
  { text: "Is remote work better for productivity than working in an office?", tag: "Work" },
  { text: "Is competitive gaming (esports) a legitimate sport?", tag: "Sports" },
  { text: "Should professional athletes be paid based on performance rather than fixed salaries?", tag: "Sports" },
  { text: "Should countries use technology to monitor public spaces more aggressively to improve safety?", tag: "Culture" },
  { text: "Is cancel culture a net positive or negative for public discourse?", tag: "Culture" },
  { text: "Should artists be allowed to use controversial imagery if it sparks important conversations?", tag: "Culture" },
  { text: "Is patriotism still a virtue in an increasingly globalized world?", tag: "Culture" }
];

const MAX_TURNS_PER_PLAYER = 3;
const TURN_SECONDS = 30;
const INACTIVITY_PASSES_TO_END = 2;
const WAIT_MESSAGES = [
  "Opponent is drafting their best angle…",
  "Your rival is thinking fast.",
  "Hold on while they sharpen their reply."
];

let myUid = null;
let selectedTopic = null;      // string or null
let inQueue = false;
let matchPollTimer = null;
let queueUnsub = null;
let debateUnsub = null;
let currentDebateId = null;
let currentDebateData = null;
let turnTimer = null;
let turnRemaining = TURN_SECONDS;

function db() { return window.mpFirebase.db; }
function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */

async function openLobby() {
  document.getElementById("mp-browse-state").classList.remove("hidden");
  document.getElementById("mp-searching-state").classList.add("hidden");
  selectedTopic = null;
  document.getElementById("mp-selected-card").classList.add("hidden");
  document.getElementById("mp-online-note").textContent = "Hot topics usually match in under 20 seconds.";
  await window.mpFirebase.ready;
  myUid = window.mpFirebase.auth.currentUser && window.mpFirebase.auth.currentUser.uid;
  loadHotTopics();
}

async function loadHotTopics() {
  const listEl = document.getElementById("mp-hot-topics");
  try {
    const today = window.DA.todayStr();
    const snap = await db().collection("hotTopics").doc(today).get();
    const topics = (snap.exists && snap.data().topics && snap.data().topics.length)
      ? snap.data().topics
      : FALLBACK_TOPICS;
    renderHotTopics(topics);
  } catch (e) {
    console.error("Failed to load hot topics, using fallback:", e);
    renderHotTopics(FALLBACK_TOPICS);
  }
}

function renderHotTopics(topics) {
  const listEl = document.getElementById("mp-hot-topics");
  listEl.innerHTML = "";
  topics.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "hot-topic-item";
    btn.innerHTML = `<span class="hot-topic-tag">${escapeHtml(t.tag || "Topic")}</span><span>${escapeHtml(t.text)}</span>`;
    btn.addEventListener("click", () => selectTopic(t.text, btn));
    listEl.appendChild(btn);
  });
}

function selectTopic(text, btnEl) {
  window.DA.playClick();
  document.querySelectorAll(".hot-topic-item").forEach((el) => el.classList.remove("selected"));
  if (selectedTopic === text) {
    selectedTopic = null;
    document.getElementById("mp-selected-card").classList.add("hidden");
    document.getElementById("mp-online-note").textContent = "Hot topics usually match in under 20 seconds.";
    return;
  }
  selectedTopic = text;
  btnEl.classList.add("selected");
  document.getElementById("mp-selected-text").textContent = text;
  document.getElementById("mp-selected-card").classList.remove("hidden");
  document.getElementById("mp-online-note").textContent = "Smart pick — this topic gets attention.";
}

document.getElementById("mp-clear-topic").addEventListener("click", () => {
  selectedTopic = null;
  document.getElementById("mp-selected-card").classList.add("hidden");
  document.querySelectorAll(".hot-topic-item").forEach((el) => el.classList.remove("selected"));
  document.getElementById("mp-online-note").textContent = "All set — random topic will keep the match fresh.";
});

/* ---------------------------------------------------------
   MATCHMAKING
   --------------------------------------------------------- */

document.getElementById("mp-find-match-btn").addEventListener("click", startSearch);
document.getElementById("mp-cancel-search-btn").addEventListener("click", cancelSearch);

async function startSearch() {
  window.DA.playClick();
  await window.mpFirebase.ready;
  const user = window.mpFirebase.auth.currentUser;
  if (!user) {
    window.DA.toast("Sign in first to join a live debate.");
    return;
  }
  myUid = user.uid;

  document.getElementById("mp-browse-state").classList.add("hidden");
  document.getElementById("mp-searching-state").classList.remove("hidden");
  document.getElementById("mp-searching-topic").textContent = selectedTopic
    ? `Topic: "${selectedTopic}"`
    : "Any topic — matched with whoever's already waiting";
  document.getElementById("mp-online-note").textContent = "Searching the queue — live opponents are on the way.";

  inQueue = true;
  const myQueueRef = db().collection("matchQueue").doc(myUid);
  await myQueueRef.set({
    uid: myUid,
    topic: selectedTopic || null,
    status: "waiting",
    createdAt: serverTs()
  });

  queueUnsub = myQueueRef.onSnapshot((snap) => {
    const data = snap.data();
    if (data && data.status === "matched" && data.debateId) {
      stopPolling();
      if (queueUnsub) { queueUnsub(); queueUnsub = null; }
      enterDebateRoom(data.debateId);
    }
  });

  attemptMatch();
  matchPollTimer = setInterval(attemptMatch, 2500);
}

async function cancelSearch() {
  window.DA.playClick();
  stopPolling();
  inQueue = false;
  if (queueUnsub) { queueUnsub(); queueUnsub = null; }
  if (myUid) {
    try { await db().collection("matchQueue").doc(myUid).delete(); } catch (e) { /* ignore */ }
  }
  document.getElementById("mp-browse-state").classList.remove("hidden");
  document.getElementById("mp-searching-state").classList.add("hidden");
}

function stopPolling() {
  if (matchPollTimer) { clearInterval(matchPollTimer); matchPollTimer = null; }
}

async function attemptMatch() {
  if (!inQueue || !myUid) return;
  try {
    const candidates = await db().collection("matchQueue")
      .where("status", "==", "waiting")
      .orderBy("createdAt", "asc")
      .limit(10)
      .get();
    const candidateDoc = candidates.docs.find((d) => d.id !== myUid);
    if (!candidateDoc) return; // nobody else waiting yet — will retry on next poll

    const opponentUid = candidateDoc.id;
    const opponentRef = db().collection("matchQueue").doc(opponentUid);
    const myRef = db().collection("matchQueue").doc(myUid);
    const debateRef = db().collection("debates").doc();

    await db().runTransaction(async (tx) => {
      const oppSnap = await tx.get(opponentRef);
      const mySnap = await tx.get(myRef);
      if (!oppSnap.exists || oppSnap.data().status !== "waiting") throw new Error("opponent-taken");
      if (!mySnap.exists || mySnap.data().status !== "waiting") throw new Error("self-taken");

      const oppData = oppSnap.data();
      const myData = mySnap.data();
      const topic = oppData.topic || myData.topic
        || FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)].text;

      tx.set(debateRef, {
        topic,
        players: [opponentUid, myUid],
        playerOrder: [opponentUid, myUid], // whoever was waiting longer opens
        turnIndex: 0,
        turns: [],
        maxTurnsPerPlayer: MAX_TURNS_PER_PLAYER,
        status: "active",
        createdAt: serverTs()
      });
      tx.update(opponentRef, { status: "matched", debateId: debateRef.id });
      tx.update(myRef, { status: "matched", debateId: debateRef.id });
    });
    // Both clients pick up the match via their own queue-doc listener above.
  } catch (e) {
    // Someone else grabbed that candidate first, or a transient conflict — just retry on next poll.
  }
}

/* ---------------------------------------------------------
   DEBATE ROOM
   --------------------------------------------------------- */

function enterDebateRoom(debateId) {
  inQueue = false;
  currentDebateId = debateId;
  window.DA.showScreen("debate-room");
  document.getElementById("debate-ended-panel").classList.add("hidden");
  document.getElementById("debate-composer").classList.remove("hidden");

  const ref = db().collection("debates").doc(debateId);
  debateUnsub = ref.onSnapshot((snap) => {
    if (!snap.exists) return;
    currentDebateData = snap.data();
    renderDebateRoom();
  });
}

function renderDebateRoom() {
  const data = currentDebateData || { topic: "Unknown topic", turns: [], maxTurnsPerPlayer: MAX_TURNS_PER_PLAYER, playerOrder: [] };
  const turns = Array.isArray(data.turns) ? data.turns : [];
  document.getElementById("debate-topic-label").textContent = data.topic || "Unknown topic";

  const totalTurns = data.maxTurnsPerPlayer * 2;
  document.getElementById("debate-progress-fill").style.width =
    Math.min(100, (data.turns.length / totalTurns) * 100) + "%";

  const wrap = document.getElementById("debate-transcript");
  wrap.innerHTML = "";
  if (!turns.length) {
    const hint = document.createElement("div");
    hint.className = "debate-bubble theirs";
    hint.innerHTML = `<div class="debate-bubble-meta">Live match</div><div>${data.playerOrder[0] === myUid ? "Start strong — you have the first move." : "Opponent is about to begin the first argument."}</div>`;
    wrap.appendChild(hint);
  }
  turns.forEach((t, i) => {
    const mine = t.uid === myUid;
    const bubble = document.createElement("div");
    bubble.className = "debate-bubble " + (mine ? "mine" : "theirs");
    bubble.innerHTML = `<div class="debate-bubble-meta">${mine ? "You" : "Opponent"} · Turn ${i + 1}</div><div>${escapeHtml(t.text)}</div>`;
    wrap.appendChild(bubble);
  });
  wrap.scrollTop = wrap.scrollHeight;

  const pill = document.getElementById("debate-turn-pill");
  const timerLabel = document.getElementById("debate-timer-value");
  const composer = document.getElementById("debate-composer");
  const waiting = document.getElementById("debate-waiting");

  if (data.status !== "active") {
    pill.textContent = "Debate over";
    pill.className = "debate-turn-pill";
    timerLabel.textContent = "—";
    timerLabel.classList.remove("urgent");
    composer.classList.add("hidden");
    waiting.classList.add("hidden");
    stopTurnTimer();
    showDebateEnded();
    return;
  }

  const whoseTurnUid = data.playerOrder[data.turnIndex % 2];
  const myTurn = whoseTurnUid === myUid;
  pill.textContent = myTurn ? "Your turn" : "Opponent's turn";
  pill.className = "debate-turn-pill " + (myTurn ? "mine" : "theirs");
  composer.classList.toggle("hidden", !myTurn);
  waiting.classList.toggle("hidden", myTurn);
  document.getElementById("debate-waiting-message").textContent = myTurn
    ? "Your opponent is waiting on your next argument."
    : WAIT_MESSAGES[data.turns.length % WAIT_MESSAGES.length];

  if (myTurn) {
    beginTurnTimer();
  } else {
    stopTurnTimer();
    timerLabel.textContent = "—";
    timerLabel.classList.remove("urgent");
  }
}

document.getElementById("debate-send-btn").addEventListener("click", sendTurn);

async function sendTurn() {
  const input = document.getElementById("debate-input");
  const text = input.value.trim();
  if (!text || !currentDebateId) return;
  window.DA.playClick();
  const ref = db().collection("debates").doc(currentDebateId);
  input.disabled = true;
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      const whoseTurnUid = data.playerOrder[data.turnIndex % 2];
      if (whoseTurnUid !== myUid) throw new Error("not-your-turn");
      const turns = data.turns.concat([{ uid: myUid, text, ts: Date.now() }]);
      const totalTurns = data.maxTurnsPerPlayer * 2;
      tx.update(ref, {
        turns,
        turnIndex: data.turnIndex + 1,
        status: turns.length >= totalTurns ? "completed" : "active"
      });
    });
    input.value = "";
  } catch (e) {
    window.DA.toast("Couldn't send — try again.");
  }
  input.disabled = false;
}

function beginTurnTimer() {
  stopTurnTimer();
  turnRemaining = TURN_SECONDS;
  refreshTurnTimer();
  turnTimer = window.setInterval(() => {
    turnRemaining -= 1;
    refreshTurnTimer();
    if (turnRemaining <= 0) {
      stopTurnTimer();
      submitTimeoutTurn();
    }
  }, 1000);
}

function refreshTurnTimer() {
  const timerLabel = document.getElementById("debate-timer-value");
  if (!timerLabel) return;
  timerLabel.textContent = `${turnRemaining}s`;
  timerLabel.classList.toggle("urgent", turnRemaining <= 8);
}

function stopTurnTimer() {
  if (turnTimer) {
    clearInterval(turnTimer);
    turnTimer = null;
  }
}

async function submitTimeoutTurn() {
  if (!currentDebateId || !myUid) return;
  const ref = db().collection("debates").doc(currentDebateId);
  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.data();
      if (!data || data.status !== "active") return;
      const whoseTurnUid = data.playerOrder[data.turnIndex % 2];
      if (whoseTurnUid !== myUid) return;
      const previousTurns = Array.isArray(data.turns) ? data.turns : [];
      const passTurn = { uid: myUid, text: "⏳ Time's up — passing the turn.", ts: Date.now() };
      const turns = previousTurns.concat([passTurn]);
      const totalTurns = data.maxTurnsPerPlayer * 2;
      const lastPasses = turns.slice(-INACTIVITY_PASSES_TO_END);
      const allPasses = lastPasses.length === INACTIVITY_PASSES_TO_END && lastPasses.every((t) => t.text.startsWith("⏳ Time's up"));
      tx.update(ref, {
        turns,
        turnIndex: data.turnIndex + 1,
        status: allPasses || turns.length >= totalTurns ? "completed" : "active"
      });
    });
  } catch (e) {
    console.warn("timeout pass failed", e);
  }
}

function getRefereeVerdict(data) {
  const turns = Array.isArray(data.turns) ? data.turns : [];
  if (!turns.length) {
    return {
      title: "No arguments were made",
      comment: "The referee could not score this debate because no turns were submitted."
    };
  }

  const scoringRules = [
    { re: /\bbecause\b/i, bonus: 2 },
    { re: /\btherefore\b/i, bonus: 2 },
    { re: /\bhowever\b/i, bonus: 2 },
    { re: /\bbut\b/i, bonus: 1 },
    { re: /\bconsequently\b/i, bonus: 2 }
  ];

  const score = { you: 0, them: 0 };
  turns.forEach((turn) => {
    const text = (turn.text || "").trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    const sentences = text.split(/[.!?]+/).filter(Boolean).length;
    let turnScore = Math.min(24, words * 0.35) + sentences * 1.4;
    scoringRules.forEach((rule) => { if (rule.re.test(text)) turnScore += rule.bonus; });
    if (words >= 90) turnScore += 2;
    if (/^⏳/.test(text)) turnScore -= 3;
    if (turn.uid === myUid) score.you += turnScore;
    else score.them += turnScore;
  });

  score.you = Math.round(score.you);
  score.them = Math.round(score.them);
  const diff = score.you - score.them;
  const total = score.you + score.them;
  const lastPasses = turns.slice(-INACTIVITY_PASSES_TO_END);
  const endedByInactivity = lastPasses.length === INACTIVITY_PASSES_TO_END && lastPasses.every((t) => /^⏳/.test(t.text));

  if (endedByInactivity) {
    return {
      title: "Match ended due to inactivity",
      comment: "Both players timed out. The referee ended the match and scored the available arguments."
    };
  }

  let verdict = "A close finish.";
  if (diff >= 8) verdict = "You clearly impressed the referee with stronger arguments.";
  else if (diff >= 3) verdict = "You edged out the opponent with cleaner reasoning.";
  else if (diff <= -8) verdict = "The opponent took this round with stronger points.";
  else if (diff <= -3) verdict = "The opponent narrowly outscored you this time.";

  const comment = `${verdict} Score: You ${score.you} — Opponent ${score.them}. ${
    diff === 0 ? "It was an evenly matched debate." : diff > 0 ? "Keep using clear structure and reasons." : "Try adding more examples and stronger transitions."
  }`;

  return {
    title: diff === 0 ? "Tie match" : diff > 0 ? "Your side wins" : "Opponent wins",
    comment
  };
}

function showDebateEnded() {
  const panel = document.getElementById("debate-ended-panel");
  if (!panel.classList.contains("hidden")) return;
  panel.classList.remove("hidden");
  const referee = getRefereeVerdict(currentDebateData || {});
  document.getElementById("debate-ended-sub").textContent = referee.title;
  document.getElementById("debate-referee-comment").textContent = referee.comment;
  window.DA.awardXp(60);
  window.DA.toast("+60 XP for completing a live debate!");
}

document.querySelectorAll(".rate-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".rate-btn").forEach((b) => b.classList.remove("picked"));
    btn.classList.add("picked");
    if (!currentDebateId || !myUid) return;
    try {
      await db().collection("debates").doc(currentDebateId).update({
        [`ratings.${myUid}`]: btn.dataset.rate
      });
    } catch (e) { /* non-critical */ }
  });
});

document.getElementById("debate-done-btn").addEventListener("click", leaveDebate);
document.getElementById("debate-exit-btn").addEventListener("click", () => {
  if (currentDebateData && currentDebateData.status === "active") {
    if (!window.confirm("Leave now? Your opponent will be left without a partner.")) return;
  }
  leaveDebate();
});

function leaveDebate() {
  window.DA.playClick();
  stopTurnTimer();
  if (debateUnsub) { debateUnsub(); debateUnsub = null; }
  currentDebateId = null;
  currentDebateData = null;
  window.DA.showScreen("home");
}

/* ---------------------------------------------------------
   WIRING
   --------------------------------------------------------- */

document.querySelectorAll('[data-nav="multiplayer"]').forEach((el) => {
  el.addEventListener("click", openLobby);
});

document.getElementById("mp-back-btn").addEventListener("click", () => {
  if (inQueue) cancelSearch();
});

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

})();
