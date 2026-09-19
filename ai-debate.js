/* =========================================================
   VERITAS — Debate the AI (solo mode)
   Loaded after app.js + supabase-config.js + multiplayer.js.
   Talks to app.js only through the window.DA bridge, same as
   multiplayer.js. Uses the "ai-debate" Supabase Edge Function
   directly (no realtime, no debates table row — everything is
   synchronous request/response since it's just you vs. the AI).

   TASK STATUS:
   - Task 1 (CSS) — done, see styles.css.
   - Task 2 (lobby + core turn loop) — done.
   - Task 3a (ending flow: referee scoring + per-turn feedback) — done.
   - Task 3b (Devil's Advocate Drill wiring) — done. Submitting
     scores the player's rebuttal via the "drill" action and
     renders it into #aidebate-devil-feedback; the drill is
     one-shot (button + textarea lock after a successful score).
   ========================================================= */
(function () {
"use strict";

// A small curated set for the "Surprise me" button — kept local so this
// mode doesn't depend on the multiplayer hot_topics table being fresh.
const RANDOM_TOPICS = [
  "Should college be free for everyone?",
  "Should social media platforms verify every user's real identity?",
  "Should artificial intelligence be granted any form of legal personhood?",
  "Should the four-day work week become the standard?",
  "Should genetic engineering of human embryos be allowed to prevent disease?",
  "Should billionaires be allowed to exist, or should wealth be capped?",
  "Should voting be mandatory for all eligible citizens?",
  "Is it ethical to eat meat in a world with viable alternatives?",
  "Should the voting age be lowered to 16?",
  "Should zoos exist, or do they do more harm than good?",
  "Should nuclear energy be the primary solution to the climate crisis?",
  "Should schools ban homework entirely?",
  "Should countries adopt a universal basic income?",
  "Is remote work better for productivity than working in an office?",
  "Should cancel culture be considered a net positive for public discourse?",
  "Should companies be legally required to disclose how their algorithms work?",
  "Should the death penalty be abolished everywhere?",
  "Should parents be allowed to genetically select traits in their children?",
  "Is space exploration a good use of public funding right now?",
  "Should facial recognition be banned from public spaces?"
];

const MAX_USER_TURNS = 3;

const BOTS = {
  sparring: { name: "Sparring Partner", rating: "~1000" },
  rival:    { name: "The Rival",        rating: "~1400" },
  champion: { name: "The Champion",     rating: "~1800" }
};

let currentTopic = null;
let currentStance = "for";  // "for" | "against" — which side the PLAYER argues
let currentBot = "rival";   // opponent strength, sent to the edge function
let turnSeconds = 90;       // 0 = unlimited
let transcript = [];        // [{ speaker, text, ts, spent }]
let userTurnsSoFar = 0;
let awaitingAi = false;
let debateOver = false;
let turnStartedAt = 0;      // when the current player turn began
let clockTimer = null;
let timeUsed = { user: 0, ai: 0 };

function fmtClock(seconds) {
  const sec = Math.max(0, Math.round(seconds));
  return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
}

function fmtTimeOfDay(ms) {
  try { return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
  catch (e) { return ""; }
}

function sb() { return window.mpSupabase.client; }

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */

function openAiDebateLobby() {
  document.getElementById("aidebate-topic-input").value = "";
  setStance("for");
  setBot(currentBot);
  setTimeControl(turnSeconds);
}

function pickRandomTopic() {
  const topic = RANDOM_TOPICS[Math.floor(Math.random() * RANDOM_TOPICS.length)];
  document.getElementById("aidebate-topic-input").value = topic;
}

function setStance(stance) {
  currentStance = stance;
  document.getElementById("aidebate-stance-for").classList.toggle("active", stance === "for");
  document.getElementById("aidebate-stance-against").classList.toggle("active", stance === "against");
}

function setBot(level) {
  if (!BOTS[level]) return;
  currentBot = level;
  document.querySelectorAll("#aidebate-bot-row .bot-card").forEach((el) => {
    el.classList.toggle("active", el.dataset.level === level);
  });
}

function setTimeControl(seconds) {
  turnSeconds = seconds;
  document.querySelectorAll("#aidebate-time-row .aidebate-stance-btn").forEach((el) => {
    el.classList.toggle("active", Number(el.dataset.seconds) === seconds);
  });
}

function startAiDebate() {
  const topic = document.getElementById("aidebate-topic-input").value.trim();
  if (!topic) {
    window.DA.toast("Type a topic or tap Surprise me first.");
    return;
  }
  window.DA.playClick();

  currentTopic = topic;
  transcript = [];
  userTurnsSoFar = 0;
  awaitingAi = false;
  debateOver = false;
  timeUsed = { user: 0, ai: 0 };
  lastDevilsAdvocate = null;
  const bot = BOTS[currentBot];
  document.getElementById("aidebate-bot-name").textContent = bot.name;
  document.getElementById("aidebate-bot-rating").textContent = bot.rating;
  document.getElementById("aidebate-bot-avatar").textContent = bot.name[4] ? bot.name[0] : "A";
  document.getElementById("aidebate-self-avatar").textContent =
    ((window.DA.getCachedProfile().displayName || "You").trim()[0] || "Y").toUpperCase();
  document.getElementById("aidebate-stance-mini").textContent = currentStance === "for" ? "FOR" : "AGAINST";
  const resignEl = document.getElementById("aidebate-resign-btn");
  if (resignEl) { resignEl.classList.remove("hidden"); resignEl.disabled = false; }
  document.getElementById("aidebate-input").value = "";
  updateAiWordCount();

  document.getElementById("aidebate-ended-panel").classList.add("hidden");
  document.getElementById("aidebate-composer").classList.remove("hidden");
  document.getElementById("aidebate-waiting").classList.add("hidden");
  document.getElementById("aidebate-devil-card").classList.add("hidden");
  document.getElementById("aidebate-feedback-list").innerHTML = "";
  document.getElementById("aidebate-devil-feedback").classList.add("hidden");
  document.getElementById("aidebate-devil-feedback").innerHTML = "";
  document.getElementById("aidebate-devil-input").value = "";

  document.getElementById("aidebate-topic-label").textContent = topic;
  const stanceLabel = document.getElementById("aidebate-stance-label");
  stanceLabel.textContent = currentStance === "for" ? "FOR" : "AGAINST";
  stanceLabel.className = "debate-turn-pill mine";

  window.DA.showScreen("ai-debate-room");
  renderTranscript();
  updateScoreboard();
  beginPlayerClock();
  document.getElementById("aidebate-input").focus();
}

/* ---------------------------------------------------------
   CLOCKS
   Solo mode had no sense of time at all: no pressure, and no
   record of how long anything took. Both sides now keep a
   clock — yours counting down under the chosen time control,
   the bot's counting up while it thinks — and every turn is
   stamped so the transcript can show it back.
   --------------------------------------------------------- */
function beginPlayerClock() {
  stopClock();
  turnStartedAt = Date.now();
  paintAiClocks();
  clockTimer = window.setInterval(() => {
    paintAiClocks();
    if (turnSeconds > 0 && !awaitingAi && !debateOver) {
      const left = turnSeconds - (Date.now() - turnStartedAt) / 1000;
      if (left <= 0) {
        stopClock();
        window.DA.toast("Out of time — that turn was passed.");
        passUserTurn();
      }
    }
  }, 250);
}

function stopClock() {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
}

function paintAiClocks() {
  const selfRow = document.getElementById("aiclock-self");
  const oppRow = document.getElementById("aiclock-opp");
  const selfFace = document.getElementById("aidebate-self-clock");
  const oppFace = document.getElementById("aidebate-ai-clock");
  if (!selfRow || !oppRow) return;

  const elapsed = turnStartedAt ? (Date.now() - turnStartedAt) / 1000 : 0;
  const myTurn = !awaitingAi && !debateOver;

  if (myTurn) {
    const left = turnSeconds > 0 ? Math.max(0, turnSeconds - elapsed) : elapsed;
    selfFace.textContent = fmtClock(left);
    selfRow.classList.toggle("urgent", turnSeconds > 0 && left <= 10);
  } else {
    selfFace.textContent = turnSeconds > 0 ? fmtClock(turnSeconds) : "—";
    selfRow.classList.remove("urgent");
  }
  oppFace.textContent = awaitingAi ? fmtClock(elapsed) : "—";

  selfRow.classList.toggle("running", myTurn);
  selfRow.classList.toggle("idle", !myTurn);
  oppRow.classList.toggle("running", awaitingAi);
  oppRow.classList.toggle("idle", !awaitingAi);

  document.getElementById("aidebate-self-used").textContent = fmtClock(timeUsed.user + (myTurn ? elapsed : 0));
  document.getElementById("aidebate-ai-used").textContent = fmtClock(timeUsed.ai + (awaitingAi ? elapsed : 0));
}

function updateAiWordCount() {
  const input = document.getElementById("aidebate-input");
  const out = document.getElementById("aidebate-word-count");
  if (!input || !out) return;
  const words = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
  const left = 600 - input.value.length;
  out.textContent = `${words} word${words === 1 ? "" : "s"} · ${left} left`;
  out.classList.toggle("low", left < 60);
}

/* ---------------------------------------------------------
   DEBATE ROOM — core turn loop
   --------------------------------------------------------- */

function renderTranscript() {
  const wrap = document.getElementById("aidebate-transcript");
  wrap.innerHTML = "";
  if (!transcript.length) {
    const hint = document.createElement("div");
    hint.className = "debate-bubble theirs";
    hint.innerHTML = `<div class="debate-bubble-meta">Debate the AI</div><div>Make your opening argument ${
      currentStance === "for" ? "in favor of" : "against"
    } the topic — you have ${MAX_USER_TURNS} turns.</div>`;
    wrap.appendChild(hint);
  }
  // Turn numbers are per speaker. They used to be the flat transcript index, so
  // your second argument was labelled "Turn 3" out of three.
  const seen = { user: 0, ai: 0 };
  transcript.forEach((t, i) => {
    const mine = t.speaker === "user";
    seen[t.speaker] += 1;
    const meta = [
      mine ? "You" : BOTS[currentBot].name,
      `Turn ${seen[t.speaker]} of ${MAX_USER_TURNS}`,
      t.ts ? fmtTimeOfDay(t.ts) : "",
      typeof t.spent === "number" ? `took ${Math.round(t.spent)}s` : ""
    ].filter(Boolean).join(" · ");
    const bubble = document.createElement("div");
    bubble.className = "debate-bubble " + (mine ? "mine" : "theirs");
    bubble.id = `aidebate-turn-${i}`;
    bubble.innerHTML = `<div class="debate-bubble-meta">${meta}</div><div>${escapeHtml(t.text)}</div>`;
    wrap.appendChild(bubble);
  });
  wrap.scrollTop = wrap.scrollHeight;
  renderAiTurnLog();
}

function renderAiTurnLog() {
  const log = document.getElementById("aidebate-turn-log");
  if (!log) return;
  log.innerHTML = "";
  if (!transcript.length) {
    const li = document.createElement("li");
    li.className = "turn-log-empty";
    li.textContent = "No arguments yet.";
    log.appendChild(li);
    return;
  }
  const seen = { user: 0, ai: 0 };
  transcript.forEach((t, i) => {
    const mine = t.speaker === "user";
    seen[t.speaker] += 1;
    const li = document.createElement("li");
    li.className = "turn-log-row" + (mine ? " mine" : "");
    li.innerHTML = `
      <span class="turn-log-who">${mine ? "You" : escapeHtml(BOTS[currentBot].name)}</span>
      <span class="turn-log-n">#${seen[t.speaker]}</span>
      <span class="turn-log-time">${typeof t.spent === "number" ? Math.round(t.spent) + "s" : "—"}</span>`;
    li.addEventListener("click", () => {
      const target = document.getElementById(`aidebate-turn-${i}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("flash");
        window.setTimeout(() => target.classList.remove("flash"), 900);
      }
    });
    log.appendChild(li);
  });
}

function updateScoreboard() {
  const pill = document.getElementById("aidebate-turn-pill");
  pill.textContent = debateOver ? "Debate over" : `Turn ${userTurnsSoFar + 1} of ${MAX_USER_TURNS}`;
  pill.className = "debate-turn-pill " + (debateOver ? "" : "mine");
  document.getElementById("aidebate-progress-fill").style.width =
    Math.min(100, (transcript.length / (MAX_USER_TURNS * 2)) * 100) + "%";
}

function setWaiting(isWaiting) {
  awaitingAi = isWaiting;
  document.getElementById("aidebate-composer").classList.toggle("hidden", isWaiting);
  document.getElementById("aidebate-waiting").classList.toggle("hidden", !isWaiting);
}

async function sendUserTurn() {
  if (awaitingAi || debateOver) return;
  const input = document.getElementById("aidebate-input");
  const text = input.value.trim();
  if (!text) return;
  if (text.length < 12) {
    window.DA.toast("Make it an argument — at least a sentence.");
    return;
  }
  window.DA.playClick();
  input.value = "";
  updateAiWordCount();
  commitUserTurn(text);
  await runAiTurn();
}

// A timed-out turn is recorded as a pass rather than silently skipped, so the
// referee sees what actually happened and the transcript stays honest.
async function passUserTurn() {
  if (awaitingAi || debateOver) return;
  commitUserTurn("⏳ (out of time — no argument made this turn)");
  await runAiTurn();
}

function commitUserTurn(text) {
  const spent = turnStartedAt ? (Date.now() - turnStartedAt) / 1000 : 0;
  timeUsed.user += spent;
  transcript.push({ speaker: "user", text, ts: Date.now(), spent });
  userTurnsSoFar += 1;
  renderTranscript();
  updateScoreboard();
}

async function runAiTurn() {
  const last = userTurnsSoFar >= MAX_USER_TURNS;
  setWaiting(true);
  turnStartedAt = Date.now();
  await fetchAiReply();
  setWaiting(false);
  if (last) {
    stopClock();
    finishAiDebate();
    return;
  }
  renderTranscript();
  updateScoreboard();
  beginPlayerClock();
  document.getElementById("aidebate-input").focus();
}

function pushAiTurn(text) {
  const spent = turnStartedAt ? (Date.now() - turnStartedAt) / 1000 : 0;
  timeUsed.ai += spent;
  transcript.push({ speaker: "ai", text, ts: Date.now(), spent });
}

async function fetchAiReply() {
  try {
    const { data, error } = await sb().functions.invoke("ai-debate", {
      body: {
        action: "opponent",
        topic: currentTopic,
        transcript: transcript.map((t) => ({ speaker: t.speaker, text: t.text })),
        aiStance: currentStance === "for" ? "against" : "for",
        difficulty: currentBot
      }
    });
    if (error) throw error;
    const text = (data && data.text) ? data.text : "(The AI opponent had nothing to add.)";
    pushAiTurn(text);
  } catch (e) {
    console.error("AI opponent reply failed:", e);
    pushAiTurn("(The AI opponent couldn't respond — network hiccup. Continue when ready.)");
    window.DA.toast("Couldn't reach the AI opponent — try your next turn.");
  }
}

function leaveAiDebate() {
  window.DA.playClick();
  if (!debateOver && transcript.length) {
    if (!window.confirm("Leave now? This debate won't be scored.")) return;
  }
  stopClock();          // the interval used to keep running after you left,
  awaitingAi = false;   // and awaitingAi could stay stuck true.
  currentTopic = null;
  transcript = [];
  userTurnsSoFar = 0;
  debateOver = false;
  window.DA.showScreen("home");
}

// Concede: stop arguing but still get scored on what you said, rather than
// the old all-or-nothing "leave and lose the whole debate".
async function concedeAiDebate() {
  if (debateOver || awaitingAi) return;
  if (!transcript.some((t) => t.speaker === "user")) {
    window.DA.toast("Make at least one argument before conceding.");
    return;
  }
  if (!window.confirm("Concede now? The referee scores the arguments you've already made.")) return;
  window.DA.playClick();
  stopClock();
  finishAiDebate();
}

/* ---------------------------------------------------------
   ENDING FLOW — Task 3a: referee scoring + per-turn feedback
   Task 3b: Devil's Advocate Drill wiring — done. The card is
   rendered here if the referee returns one; #aidebate-devil-
   submit-btn's handler and drill scoring live further down
   in this file (submitDevilsAdvocateDrill()).
   --------------------------------------------------------- */

// Set once a verdict comes back, so the drill submit handler
// has the missed point to send without re-deriving it.
let lastDevilsAdvocate = null;

async function finishAiDebate() {
  debateOver = true;
  stopClock();
  paintAiClocks();
  renderTranscript();
  updateScoreboard();
  const resignEl = document.getElementById("aidebate-resign-btn");
  if (resignEl) resignEl.classList.add("hidden");

  document.getElementById("aidebate-composer").classList.add("hidden");
  document.getElementById("aidebate-waiting-message").textContent = "The referee is scoring the debate…";
  setWaiting(true);

  let verdict;
  let usedFallback = false;
  try {
    const { data, error } = await sb().functions.invoke("ai-debate", {
      body: {
        action: "referee",
        topic: currentTopic,
        transcript: transcript.map((t) => ({ speaker: t.speaker, text: t.text }))
      }
    });
    if (error) throw error;
    if (!data || !data.ok || !data.verdict) throw new Error("malformed referee response");
    verdict = data.verdict;
  } catch (e) {
    console.error("AI referee failed, using local fallback scoring:", e);
    verdict = localHeuristicVerdict();
    usedFallback = true;
    window.DA.toast("Couldn't reach the AI referee — showing a rough estimate instead.");
  }

  setWaiting(false);
  document.getElementById("aidebate-waiting-message").textContent = "The AI opponent is drafting a reply…";
  renderVerdict(verdict, usedFallback);
}

function renderVerdict(verdict, usedFallback) {
  const { debaterScore, aiScore, winner, summary, turnFeedback, devilsAdvocate } = verdict;

  const titleEl = document.getElementById("aidebate-ended-title");
  const subEl = document.getElementById("aidebate-ended-sub");
  if (winner === "debater") titleEl.textContent = "You won the debate";
  else if (winner === "ai") titleEl.textContent = "The AI opponent won";
  else titleEl.textContent = "It's a tie";
  subEl.textContent = `You: ${debaterScore} · AI opponent: ${aiScore}`;

  document.getElementById("aidebate-referee-comment").textContent =
    summary + (usedFallback ? " (Rough estimate — the AI referee was unreachable.)" : "");

  const feedbackList = document.getElementById("aidebate-feedback-list");
  feedbackList.innerHTML = "";
  (turnFeedback || []).forEach((f) => {
    const item = document.createElement("div");
    item.className = "aidebate-feedback-item";
    item.innerHTML = `
      <span class="aidebate-feedback-turn">Your turn ${f.turn}</span>
      <p><strong>Logic:</strong> ${escapeHtml(f.logic)}</p>
      <p><strong>Evidence:</strong> ${escapeHtml(f.evidence)}</p>
      <p><strong>Responsiveness:</strong> ${escapeHtml(f.responsiveness)}</p>
    `;
    feedbackList.appendChild(item);
  });

  const devilCard = document.getElementById("aidebate-devil-card");
  lastDevilsAdvocate = devilsAdvocate || null;
  if (devilsAdvocate && devilsAdvocate.missedPoint) {
    document.getElementById("aidebate-devil-point").textContent = devilsAdvocate.missedPoint;
    document.getElementById("aidebate-devil-challenge").textContent = devilsAdvocate.challenge || "Argue it now.";
    document.getElementById("aidebate-devil-feedback").classList.add("hidden");
    document.getElementById("aidebate-devil-feedback").innerHTML = "";
    document.getElementById("aidebate-devil-input").value = "";
    devilCard.classList.remove("hidden");
  } else {
    devilCard.classList.add("hidden");
  }

  document.getElementById("aidebate-ended-panel").classList.remove("hidden");
}

// Local, non-AI fallback if the referee call fails outright — same spirit as
// multiplayer.js's heuristicVerdict(), so a network hiccup never blocks the
// end screen. Deliberately simple: word count + a few connective-word cues.
function localHeuristicVerdict() {
  const userTurns = transcript.filter((t) => t.speaker === "user");
  const connectives = ["because", "therefore", "however", "consequently", "for example"];

  let debaterScore = 50;
  const turnFeedback = userTurns.map((t, i) => {
    const words = t.text.trim().split(/\s+/).filter(Boolean).length;
    const hasConnective = connectives.some((c) => t.text.toLowerCase().includes(c));
    const bump = Math.min(8, Math.round(words / 8)) + (hasConnective ? 6 : 0);
    debaterScore += bump;
    return {
      turn: i + 1,
      logic: hasConnective ? "Used clear reasoning connectors." : "Could use more explicit reasoning (e.g. \"because\", \"therefore\").",
      evidence: words > 25 ? "Argument had reasonable depth." : "Consider adding a concrete example or evidence.",
      responsiveness: "Not independently assessed — this is an estimate, not an AI read.",
    };
  });

  debaterScore = Math.max(0, Math.min(100, debaterScore));
  const aiScore = Math.max(0, Math.min(100, 100 - debaterScore));
  const winner = debaterScore > aiScore ? "debater" : debaterScore < aiScore ? "ai" : "tie";

  return {
    debaterScore,
    aiScore,
    winner,
    summary: "This is a rough, non-AI estimate based on argument length and structure — not a substantive read of your reasoning.",
    turnFeedback,
    devilsAdvocate: null,
  };
}

/* ---------------------------------------------------------
   TASK 3b — Devil's Advocate Drill
   --------------------------------------------------------- */

let drillSubmitting = false;

async function submitDevilsAdvocateDrill() {
  if (drillSubmitting) return;
  if (!lastDevilsAdvocate || !lastDevilsAdvocate.missedPoint) return;

  const input = document.getElementById("aidebate-devil-input");
  const rebuttal = input.value.trim();
  if (!rebuttal) {
    window.DA.toast("Write your argument for the missed point first.");
    return;
  }

  window.DA.playClick();
  drillSubmitting = true;

  const btn = document.getElementById("aidebate-devil-submit-btn");
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Scoring…";
  input.disabled = true;

  const feedbackEl = document.getElementById("aidebate-devil-feedback");

  try {
    const { data, error } = await sb().functions.invoke("ai-debate", {
      body: {
        action: "drill",
        topic: currentTopic,
        missedPoint: lastDevilsAdvocate.missedPoint,
        rebuttal
      }
    });
    if (error) throw error;
    if (!data || !data.ok) throw new Error("malformed drill response");

    feedbackEl.innerHTML = `
      <span class="aidebate-devil-score">Score: ${data.score}/100</span>
      <p>${escapeHtml(data.feedback)}</p>
    `;
    feedbackEl.classList.remove("hidden");
    // Drill is one-shot: leave the input's text visible but locked in place
    // rather than clearing it, so the player can see what they argued.
    btn.textContent = "Drill complete";
  } catch (e) {
    console.error("Devil's Advocate drill scoring failed:", e);
    window.DA.toast("Couldn't reach the AI to score that — try again.");
    btn.disabled = false;
    input.disabled = false;
    btn.textContent = originalLabel;
    drillSubmitting = false;
    return;
  }

  drillSubmitting = false;
}

/* ---------------------------------------------------------
   WIRING
   --------------------------------------------------------- */

document.querySelectorAll('[data-nav="ai-debate"]').forEach((el) => {
  el.addEventListener("click", openAiDebateLobby);
});

document.getElementById("aidebate-random-btn").addEventListener("click", () => {
  window.DA.playClick();
  pickRandomTopic();
});

document.getElementById("aidebate-stance-for").addEventListener("click", () => {
  window.DA.playClick();
  setStance("for");
});
document.getElementById("aidebate-stance-against").addEventListener("click", () => {
  window.DA.playClick();
  setStance("against");
});

document.getElementById("aidebate-start-btn").addEventListener("click", startAiDebate);
document.getElementById("aidebate-send-btn").addEventListener("click", sendUserTurn);
document.getElementById("aidebate-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    sendUserTurn();
  }
});

document.querySelectorAll("#aidebate-bot-row .bot-card").forEach((el) => {
  el.addEventListener("click", () => { window.DA.playClick(); setBot(el.dataset.level); });
});
document.querySelectorAll("#aidebate-time-row .aidebate-stance-btn").forEach((el) => {
  el.addEventListener("click", () => { window.DA.playClick(); setTimeControl(Number(el.dataset.seconds)); });
});

document.getElementById("aidebate-input").addEventListener("input", updateAiWordCount);

const aiResign = document.getElementById("aidebate-resign-btn");
if (aiResign) aiResign.addEventListener("click", concedeAiDebate);

const aiAgain = document.getElementById("aidebate-again-btn");
if (aiAgain) aiAgain.addEventListener("click", () => {
  // Straight back in on the same topic and settings — no trip through the lobby.
  const topic = currentTopic;
  if (!topic) { leaveAiDebate(); return; }
  document.getElementById("aidebate-topic-input").value = topic;
  startAiDebate();
});

document.getElementById("aidebate-exit-btn").addEventListener("click", leaveAiDebate);
document.getElementById("aidebate-done-btn").addEventListener("click", leaveAiDebate);
document.getElementById("aidebate-devil-submit-btn").addEventListener("click", submitDevilsAdvocateDrill);

window.aiDebateOpenLobby = openAiDebateLobby;

})();
