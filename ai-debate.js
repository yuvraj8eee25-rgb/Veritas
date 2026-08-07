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

let currentTopic = null;
let currentStance = "for";  // "for" | "against" — which side the PLAYER argues
let transcript = [];        // [{ speaker: "user" | "ai", text }]
let userTurnsSoFar = 0;
let awaitingAi = false;
let debateOver = false;

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
  document.getElementById("aidebate-input").focus();
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
  transcript.forEach((t, i) => {
    const mine = t.speaker === "user";
    const bubble = document.createElement("div");
    bubble.className = "debate-bubble " + (mine ? "mine" : "theirs");
    bubble.innerHTML = `<div class="debate-bubble-meta">${mine ? "You" : "AI opponent"} · Turn ${i + 1}</div><div>${escapeHtml(t.text)}</div>`;
    wrap.appendChild(bubble);
  });
  wrap.scrollTop = wrap.scrollHeight;
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

  window.DA.playClick();
  input.value = "";
  transcript.push({ speaker: "user", text });
  userTurnsSoFar += 1;
  renderTranscript();
  updateScoreboard();

  if (userTurnsSoFar >= MAX_USER_TURNS) {
    // Player's last turn — get one final AI reply, then move straight to scoring.
    setWaiting(true);
    await fetchAiReply();
    setWaiting(false);
    finishAiDebate();
    return;
  }

  setWaiting(true);
  await fetchAiReply();
  setWaiting(false);
  renderTranscript();
  updateScoreboard();
  document.getElementById("aidebate-input").focus();
}

async function fetchAiReply() {
  try {
    const { data, error } = await sb().functions.invoke("ai-debate", {
      body: { action: "opponent", topic: currentTopic, transcript, aiStance: currentStance === "for" ? "against" : "for" }
    });
    if (error) throw error;
    const text = (data && data.text) ? data.text : "(The AI opponent had nothing to add.)";
    transcript.push({ speaker: "ai", text });
  } catch (e) {
    console.error("AI opponent reply failed:", e);
    transcript.push({ speaker: "ai", text: "(The AI opponent couldn't respond — network hiccup. Continue when ready.)" });
    window.DA.toast("Couldn't reach the AI opponent — try your next turn.");
  }
}

function leaveAiDebate() {
  window.DA.playClick();
  if (!debateOver && transcript.length) {
    if (!window.confirm("Leave now? This debate won't be scored.")) return;
  }
  currentTopic = null;
  transcript = [];
  userTurnsSoFar = 0;
  debateOver = false;
  window.DA.showScreen("home");
}

/* ---------------------------------------------------------
   ENDING FLOW — Task 3a: referee scoring + per-turn feedback
   (Task 3b, still TODO: wiring the Devil's Advocate Drill
   submit button — the card is rendered here if the referee
   returns one, but #aidebate-devil-submit-btn has no handler
   yet and #aidebate-devil-input is inert until Task 3b.)
   --------------------------------------------------------- */

// Set once a verdict comes back, so Task 3b's drill submit handler
// has the missed point to send without re-deriving it.
let lastDevilsAdvocate = null;

async function finishAiDebate() {
  debateOver = true;
  renderTranscript();
  updateScoreboard();

  document.getElementById("aidebate-composer").classList.add("hidden");
  document.getElementById("aidebate-waiting-message").textContent = "The referee is scoring the debate…";
  setWaiting(true);

  let verdict;
  let usedFallback = false;
  try {
    const { data, error } = await sb().functions.invoke("ai-debate", {
      body: { action: "referee", topic: currentTopic, transcript }
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

document.getElementById("aidebate-exit-btn").addEventListener("click", leaveAiDebate);
document.getElementById("aidebate-done-btn").addEventListener("click", leaveAiDebate);
document.getElementById("aidebate-devil-submit-btn").addEventListener("click", submitDevilsAdvocateDrill);

window.aiDebateOpenLobby = openAiDebateLobby;

})();
