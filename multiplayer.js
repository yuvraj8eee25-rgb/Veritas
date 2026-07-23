/* =========================================================
   VERITAS — Multiplayer (Supabase)
   Loaded after app.js + supabase-config.js.
   Talks to app.js only through the window.DA bridge.
   ========================================================= */
(function () {
"use strict";

const FALLBACK_TOPICS = [
  { text: "Should social media platforms verify every user's real identity?", tag: "Tech" },
  { text: "Should artificial intelligence be granted any form of legal personhood?", tag: "Tech" },
  { text: "Should companies be legally required to disclose how their algorithms work?", tag: "Tech" },
  { text: "Should facial recognition be banned from public spaces?", tag: "Tech" },
  { text: "Should there be a legal right to repair your own devices?", tag: "Tech" },
  { text: "Should AI-generated art be eligible for copyright protection?", tag: "Tech" },
  { text: "Should tech companies be broken up to reduce monopoly power?", tag: "Tech" },
  { text: "Should children under 16 be banned from social media entirely?", tag: "Tech" },
  { text: "Should countries adopt a universal basic income?", tag: "Economics" },
  { text: "Is it better to rent or buy a home in today's economy?", tag: "Economics" },
  { text: "Should billionaires be allowed to exist, or should wealth be capped?", tag: "Economics" },
  { text: "Should the minimum wage be tied to the cost of living automatically?", tag: "Economics" },
  { text: "Is cryptocurrency a net positive or negative for the global economy?", tag: "Economics" },
  { text: "Should inheritance above a certain amount be taxed at a much higher rate?", tag: "Economics" },
  { text: "Should governments bail out failing banks and corporations?", tag: "Economics" },
  { text: "Is a four-day work week better for the economy than a five-day week?", tag: "Economics" },
  { text: "Should university education be free for everyone?", tag: "Policy" },
  { text: "Should voting be mandatory for all eligible citizens?", tag: "Policy" },
  { text: "Should countries open their borders more freely to immigration?", tag: "Policy" },
  { text: "Should the voting age be lowered to 16?", tag: "Policy" },
  { text: "Should governments require vaccine passports during pandemics?", tag: "Policy" },
  { text: "Should marijuana be legalized nationwide?", tag: "Policy" },
  { text: "Should the death penalty be abolished everywhere?", tag: "Policy" },
  { text: "Should gun ownership require stricter licensing and testing?", tag: "Policy" },
  { text: "Is it ethical to eat meat in a world with viable alternatives?", tag: "Ethics" },
  { text: "Is it ethical for companies to use AI to screen job applicants?", tag: "Ethics" },
  { text: "Should zoos exist, or do they do more harm than good?", tag: "Ethics" },
  { text: "Is it ethical to bring children into a world facing climate change?", tag: "Ethics" },
  { text: "Should euthanasia be a legal right for the terminally ill?", tag: "Ethics" },
  { text: "Is it ethical to use animals for medical testing?", tag: "Ethics" },
  { text: "Should parents be allowed to genetically select traits in their children?", tag: "Ethics" },
  { text: "Is it ethical to profit from art created by AI trained on human work?", tag: "Ethics" },
  { text: "Should social media have a minimum age requirement stricter than today's?", tag: "Society" },
  { text: "Should countries ban single-use plastics even if it raises consumer costs?", tag: "Society" },
  { text: "Is space exploration a good use of public funding right now?", tag: "Science" },
  { text: "Should genetic engineering of human embryos be allowed to prevent disease?", tag: "Science" },
  { text: "Is nuclear energy the best solution to the climate crisis?", tag: "Environment" },
  { text: "Should businesses be legally required to offset their carbon emissions?", tag: "Environment" },
  { text: "Do standardized tests actually measure student ability fairly?", tag: "Education" },
  { text: "Should schools teach students how to manage personal finances?", tag: "Education" },
  { text: "Is remote work better for productivity than working in an office?", tag: "Work" },
  { text: "Is competitive gaming (esports) a legitimate sport?", tag: "Sports" },
  { text: "Is cancel culture a net positive or negative for public discourse?", tag: "Culture" },
  { text: "Is patriotism still a virtue in an increasingly globalized world?", tag: "Culture" }
];

// Primary tabs shown first, in this order — everything else (Society, Science,
// Environment, Education, Work, Sports, Culture, ...) is appended after them.
const PRIMARY_CATEGORIES = ["Tech", "Economics", "Policy", "Ethics"];

const CATEGORY_COLORS = {
  Tech:        { bg: "rgba(56,142,235,0.16)",  text: "#7fb4f0" },
  Economics:   { bg: "rgba(99,153,34,0.18)",   text: "#9ecb6b" },
  Policy:      { bg: "rgba(186,117,23,0.20)",  text: "#f0b95c" },
  Ethics:      { bg: "rgba(127,119,221,0.20)", text: "#b3aaf2" },
  Society:     { bg: "rgba(212,83,126,0.18)",  text: "#f095b1" },
  Science:     { bg: "rgba(56,142,235,0.16)",  text: "#7fb4f0" },
  Environment: { bg: "rgba(99,153,34,0.18)",   text: "#9ecb6b" },
  Education:   { bg: "rgba(186,117,23,0.20)",  text: "#f0b95c" },
  Work:        { bg: "rgba(136,135,128,0.20)", text: "#c2c0b6" },
  Sports:      { bg: "rgba(216,90,48,0.20)",   text: "#f0997b" },
  Culture:     { bg: "rgba(212,83,126,0.18)",  text: "#f095b1" }
};
const DEFAULT_CATEGORY_COLOR = { bg: "rgba(136,135,128,0.20)", text: "#c2c0b6" };

let allHotTopics = [];       // last loaded topic list, unfiltered
let activeCategory = "All";  // currently selected tab

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
let queueChannel = null;
let debateChannel = null;
let currentDebateId = null;
let currentDebateData = null;
let turnTimer = null;
let turnRemaining = TURN_SECONDS;
let lastTimedTurnIndex = null; // only restart the turn timer when the turn index actually advances

function sb() { return window.mpSupabase.client; }

// Postgres rows are snake_case; map them to the camelCase shape the rest
// of this file (and the render/verdict functions below) already expect.
function rowToDebateData(row) {
  return {
    topic: row.topic,
    players: row.players,
    playerOrder: row.player_order,
    turnIndex: row.turn_index,
    turns: row.turns || [],
    maxTurnsPerPlayer: row.max_turns_per_player,
    status: row.status,
    ratings: row.ratings || {}
  };
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */

async function openLobby() {
  document.getElementById("mp-browse-state").classList.remove("hidden");
  document.getElementById("mp-searching-state").classList.add("hidden");
  selectedTopic = null;
  document.getElementById("mp-selected-card").classList.add("hidden");
  document.getElementById("mp-online-note").textContent = "Hot topics usually match in under 20 seconds.";
  await window.mpSupabase.ready;
  const { data: { user } } = await sb().auth.getUser();
  myUid = user && user.id;
  loadHotTopics();
}

async function loadHotTopics() {
  try {
    const today = window.DA.todayStr();
    const { data, error } = await sb()
      .from("hot_topics")
      .select("topics")
      .eq("date", today)
      .maybeSingle();
    if (error) throw error;
    const topics = (data && data.topics && data.topics.length) ? data.topics : FALLBACK_TOPICS;
    allHotTopics = topics;
    activeCategory = "All";
    renderCategoryTabs();
    renderHotTopics(filterByActiveCategory());
  } catch (e) {
    console.error("Failed to load hot topics, using fallback:", e);
    allHotTopics = FALLBACK_TOPICS;
    activeCategory = "All";
    renderCategoryTabs();
    renderHotTopics(filterByActiveCategory());
  }
}

function filterByActiveCategory() {
  if (activeCategory === "All") return allHotTopics;
  return allHotTopics.filter((t) => (t.tag || "Topic") === activeCategory);
}

/* Deterministic pseudo-stats (pro % and player count) derived from the topic
   text, so the split bar looks alive even before real vote data exists.
   Swap this out once turns/votes are tracked per topic. */
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pseudoStats(text) {
  const h = hashString(text);
  const pro = 25 + (h % 51); // 25–75
  const players = 300 + (h % 2800);
  return { pro, players };
}

function categoryColor(tag) {
  return CATEGORY_COLORS[tag] || DEFAULT_CATEGORY_COLOR;
}

const CATEGORY_ICONS = {
  All: "🔥", Tech: "💻", Economics: "📊", Policy: "🏛️", Ethics: "⚖️",
  Society: "🌐", Science: "🔬", Environment: "🌱", Education: "🎓",
  Work: "💼", Sports: "🏅", Culture: "🎭"
};

function getOrCreateTabsEl() {
  let tabsEl = document.getElementById("mp-category-tabs");
  if (tabsEl) return tabsEl;
  const listEl = document.getElementById("mp-hot-topics");
  if (!listEl || !listEl.parentNode) return null;
  tabsEl = document.createElement("div");
  tabsEl.id = "mp-category-tabs";
  tabsEl.className = "mp-category-tabs";
  tabsEl.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaX) !== 0 || Math.abs(event.deltaY) !== 0) {
      tabsEl.scrollLeft += event.deltaY || event.deltaX;
      event.preventDefault();
    }
  }, { passive: false });
  listEl.parentNode.insertBefore(tabsEl, listEl);
  return tabsEl;
}

function renderCategoryTabs() {
  const tabsEl = getOrCreateTabsEl();
  if (!tabsEl) return;
  const presentTags = Array.from(new Set(allHotTopics.map((t) => t.tag || "Topic")));
  const primaryPresent = PRIMARY_CATEGORIES.filter((c) => presentTags.includes(c));
  const rest = presentTags.filter((c) => !PRIMARY_CATEGORIES.includes(c));
  const cats = ["All"].concat(primaryPresent, rest);

  tabsEl.innerHTML = "";
  cats.forEach((cat) => {
    const isActive = cat === activeCategory;
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "mp-tab" + (isActive ? " active" : "");
    tab.innerHTML = `<span>${CATEGORY_ICONS[cat] || "📌"}</span><span>${escapeHtml(cat)}</span>`;
    tab.addEventListener("click", () => {
      window.DA.playClick();
      activeCategory = cat;
      renderCategoryTabs();
      renderHotTopics(filterByActiveCategory());
    });
    tabsEl.appendChild(tab);
  });
}

function renderHotTopics(topics) {
  const listEl = document.getElementById("mp-hot-topics");
  listEl.innerHTML = "";
  topics.forEach((t) => {
    const tag = t.tag || "Topic";
    const color = categoryColor(tag);
    const { pro, players } = pseudoStats(t.text);
    const con = 100 - pro;

    const btn = document.createElement("button");
    btn.className = "hot-topic-item";
    btn.type = "button";
    btn.innerHTML = `
      <div class="hot-topic-body">
        <div class="hot-topic-head">
          <span class="hot-topic-tag" style="background:${color.bg}; color:${color.text};">
            ${escapeHtml(tag.toUpperCase())}
          </span>
          <span class="hot-topic-count">${players.toLocaleString()} debating</span>
        </div>
        <div class="hot-topic-title">${escapeHtml(t.text)}</div>
        <div class="hot-topic-bar-row">
          <span class="hot-topic-pct pro">${pro}%</span>
          <div class="hot-topic-bar-track">
            <div class="hot-topic-bar-fill" style="width:${pro}%;"></div>
          </div>
          <span class="hot-topic-pct con">${con}%</span>
        </div>
        <div class="hot-topic-bar-labels"><span>PRO</span><span>CON</span></div>
      </div>
    `;
    btn.addEventListener("click", () => selectTopic(t.text, btn));
    listEl.appendChild(btn);
  });
}

function selectTopic(text, btnEl) {
  window.DA.playClick();
  document.querySelectorAll(".hot-topic-item").forEach((el) => {
    el.classList.remove("selected");
  });
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
  document.querySelectorAll(".hot-topic-item").forEach((el) => {
    el.classList.remove("selected");
  });
  document.getElementById("mp-online-note").textContent = "All set — random topic will keep the match fresh.";
});

document.getElementById("mp-toggle-topics-btn").addEventListener("click", () => {
  const tabsEl = document.getElementById("mp-category-tabs");
  const listEl = document.getElementById("mp-hot-topics");
  const hintEl = document.getElementById("mp-topics-collapse-hint");
  const btn = document.getElementById("mp-toggle-topics-btn");
  const hidden = listEl.classList.toggle("hidden");
  tabsEl.classList.toggle("hidden", hidden);
  hintEl.textContent = hidden ? "Tap to expand the curated debate topics." : "Topics are visible. Choose one and start your match.";
  btn.textContent = hidden ? `View topics (${allHotTopics.length || 0})` : "Hide topics";
  btn.setAttribute("aria-expanded", String(!hidden));
});

/* ---------------------------------------------------------
   MATCHMAKING
   --------------------------------------------------------- */

document.getElementById("mp-find-match-btn").addEventListener("click", startSearch);
document.getElementById("mp-cancel-search-btn").addEventListener("click", cancelSearch);

async function startSearch() {
  window.DA.playClick();
  await window.mpSupabase.ready;
  const { data: { user } } = await sb().auth.getUser();
  if (!user) {
    window.DA.toast("Sign in first to join a live debate.");
    return;
  }
  myUid = user.id;

  document.getElementById("mp-browse-state").classList.add("hidden");
  document.getElementById("mp-searching-state").classList.remove("hidden");
  document.getElementById("mp-searching-topic").textContent = selectedTopic
    ? `Topic: "${selectedTopic}"`
    : "Any topic — matched with whoever's already waiting";
  document.getElementById("mp-online-note").textContent = "Searching the queue — live opponents are on the way.";

  inQueue = true;
  await sb().from("match_queue").upsert({
    uid: myUid,
    topic: selectedTopic || null,
    status: "waiting",
    debate_id: null
  });

  queueChannel = sb()
    .channel(`queue-${myUid}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "match_queue", filter: `uid=eq.${myUid}` },
      (payload) => {
        const row = payload.new;
        if (row && row.status === "matched" && row.debate_id) {
          stopPolling();
          if (queueChannel) { sb().removeChannel(queueChannel); queueChannel = null; }
          enterDebateRoom(row.debate_id);
        }
      }
    )
    .subscribe();

  attemptMatch();
  matchPollTimer = setInterval(attemptMatch, 2500);
}

async function cancelSearch() {
  window.DA.playClick();
  stopPolling();
  inQueue = false;
  if (queueChannel) { sb().removeChannel(queueChannel); queueChannel = null; }
  if (myUid) {
    try { await sb().from("match_queue").delete().eq("uid", myUid); } catch (e) { /* ignore */ }
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
    // attempt_match() does the whole find-opponent + create-debate + flip-both-rows
    // step atomically in Postgres (row locking replaces the old retry-on-conflict
    // transaction loop). Both clients learn about the result via their own
    // match_queue row's realtime subscription above, so nothing else is needed here.
    const fallback = FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)].text;
    await sb().rpc("attempt_match", { p_fallback_topic: fallback });
  } catch (e) {
    // Transient conflict, or nobody else waiting yet — just retry on next poll.
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

  sb().from("debates").select("*").eq("id", debateId).single().then(({ data }) => {
    if (data) {
      currentDebateData = rowToDebateData(data);
      renderDebateRoom();
    }
  });

  debateChannel = sb()
    .channel(`debate-${debateId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "debates", filter: `id=eq.${debateId}` },
      (payload) => {
        currentDebateData = rowToDebateData(payload.new);
        renderDebateRoom();
      }
    )
    .subscribe();
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
    if (lastTimedTurnIndex !== data.turnIndex) {
      lastTimedTurnIndex = data.turnIndex;
      beginTurnTimer();
    }
  } else {
    lastTimedTurnIndex = null;
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
  input.disabled = true;
  try {
    const { error } = await sb().rpc("submit_turn", { p_debate_id: currentDebateId, p_text: text });
    if (error) throw error;
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
  try {
    await sb().rpc("submit_timeout_turn", { p_debate_id: currentDebateId });
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
    { token: "because", bonus: 2 },
    { token: "therefore", bonus: 2 },
    { token: "however", bonus: 2 },
    { token: "but", bonus: 1 },
    { token: "consequently", bonus: 2 }
  ];

  const score = { you: 0, them: 0 };
  turns.forEach((turn) => {
    const text = (turn.text || "").trim();
    const normalized = text.toLowerCase();
    const wordTokens = normalized.match(/\b[a-z0-9']+\b/g) || [];
    const uniqueWords = new Set(wordTokens).size;
    const words = wordTokens.length;
    const sentences = text.split(/[.!?]+/).filter(Boolean).length;
    const lengthScore = Math.min(24, Math.sqrt(words) * 5.2);
    const diversityBonus = Math.round((words > 0 ? uniqueWords / words : 0) * 4);

    const connectiveBonus = scoringRules.reduce((sum, rule) => {
      return sum + (new RegExp(`\\b${rule.token}\\b`, "i").test(normalized) ? rule.bonus : 0);
    }, 0);

    let turnScore = lengthScore + sentences * 1.4 + diversityBonus + Math.min(connectiveBonus, 8);
    if (words >= 90) turnScore += 2;
    if (/^⏳/.test(text)) turnScore -= 3;
    if (turn.uid === myUid) score.you += turnScore;
    else score.them += turnScore;
  });

  score.you = Math.round(score.you);
  score.them = Math.round(score.them);
  const diff = score.you - score.them;
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
      await sb().rpc("submit_rating", { p_debate_id: currentDebateId, p_rating: btn.dataset.rate });
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
  lastTimedTurnIndex = null;
  if (debateChannel) { sb().removeChannel(debateChannel); debateChannel = null; }
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

window.mpOpenLobby = openLobby;

})();