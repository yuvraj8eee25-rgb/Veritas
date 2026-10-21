/* =========================================================
   VERITAS — Multiplayer (Supabase)
   Loaded after app.js + supabase-config.js.
   Talks to app.js only through the window.DA bridge.
   ========================================================= */
import { SpeechPractice, appendRecording } from "./src/features/speech-practice.js";
import { trainingSettings } from "./src/features/training-settings.js";
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
let topicSearchQuery = "";
let browseForAiDebate = false;

const MAX_TURNS_PER_PLAYER = 3;
const TURN_SECONDS = 180;
const speech = new SpeechPractice(document.getElementById("debate-composer"), document.getElementById("debate-input"), "live");
let assignedPractice = null;
let privateRoom = null;
let privatePoll = null;
let joiningPrivate = false;
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
let opponentName = "Opponent";  // populated from profiles.display_name in enterDebateRoom
let opponentElo = 1200;         // opponent's ELO rating
let initialElo = null;          // stored at start of debate to compute delta at the end
let turnTimer = null;
let turnRemaining = TURN_SECONDS;
let lastTimedTurnIndex = null; // only restart the turn timer when the turn index actually advances

function sb() { return window.mpSupabase.client; }

// Postgres rows are snake_case; map them to the camelCase shape the rest
// of this file (and the render/verdict functions below) already expect.
function rowToDebateData(row) {
  return {
    topic: row.topic,
    practiceMode: row.practice_mode || "written",
    turnSeconds: row.turn_seconds || TURN_SECONDS,
    speechSeconds: row.speech_seconds || 90,
    assignmentId: row.assignment_id || null,
    isPrivate: !!row.is_private,
    players: row.players,
    playerOrder: row.player_order,
    turnIndex: row.turn_index,
    turns: row.turns || [],
    maxTurnsPerPlayer: row.max_turns_per_player,
    status: row.status,
    ratings: row.ratings || {},
    aiVerdict: row.ai_verdict || null,
    aiScoredAt: row.ai_scored_at || null,
    // These two were being dropped on the floor, which is why the turn clock
    // was a purely local countdown: it restarted at 30s on every reload and the
    // two players could see completely different times left.
    lastTurnAt: row.last_turn_at ? Date.parse(row.last_turn_at) : null,
    createdAt: row.created_at ? Date.parse(row.created_at) : null
  };
}

/* ---------------------------------------------------------
   SERVER CLOCK
   Every turn row carries a server-generated `ts` (epoch ms).
   When one arrives over realtime it was written a moment ago,
   so it doubles as a clock sync: the gap between it and the
   local clock is this device's offset. Everything time-related
   below runs off serverNow() rather than Date.now(), so both
   players count down to the same instant even if one machine's
   clock is minutes off.
   --------------------------------------------------------- */
let serverOffset = 0;

function serverNow() { return Date.now() + serverOffset; }

let syncedTurnCount = -1;

function syncServerClock(data) {
  const turns = Array.isArray(data.turns) ? data.turns : [];
  // Only a turn we have not seen before is "just written"; a later UPDATE for
  // the same turn (the ai_verdict write, say) carries an old timestamp and
  // would otherwise be mistaken for a huge clock drift.
  if (turns.length <= syncedTurnCount) return;
  syncedTurnCount = turns.length;
  const last = turns[turns.length - 1];
  if (!last || typeof last.ts !== "number") return;
  const drift = last.ts - Date.now();
  if (Math.abs(drift) < 86400000) serverOffset = drift;
}

function turnDeadline(data) {
  const anchor = data.lastTurnAt || data.createdAt;
  if (!anchor) return null;
  return anchor + (data.turnSeconds || TURN_SECONDS) * 1000;
}

function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

function fmtTimeOfDay(ms) {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch (e) { return ""; }
}

// How long each player has spent thinking across the whole match, measured
// from the gaps between consecutive server timestamps.
function thinkTimes(data) {
  const turns = Array.isArray(data.turns) ? data.turns : [];
  const used = {};
  let prev = data.createdAt || (turns[0] && turns[0].ts) || null;
  turns.forEach((t) => {
    if (typeof t.ts === "number" && prev) {
      const spent = Math.max(0, Math.min((data.turnSeconds || TURN_SECONDS) * 1000, t.ts - prev)) / 1000;
      used[t.uid] = (used[t.uid] || 0) + spent;
    }
    if (typeof t.ts === "number") prev = t.ts;
  });
  return used;
}

// Seconds this specific turn took, for the per-bubble "took 18s" line.
function turnSpent(data, index) {
  const turns = Array.isArray(data.turns) ? data.turns : [];
  const t = turns[index];
  if (!t || typeof t.ts !== "number") return null;
  const prev = index > 0 && typeof turns[index - 1].ts === "number"
    ? turns[index - 1].ts
    : data.createdAt;
  if (!prev) return null;
  return Math.max(0, Math.min(data.turnSeconds || TURN_SECONDS, (t.ts - prev) / 1000));
}

/* ---------------------------------------------------------
   LOBBY
   --------------------------------------------------------- */

async function openLobby() {
  document.getElementById("mp-browse-state").classList.remove("hidden");
  document.getElementById("mp-searching-state").classList.add("hidden");
  selectedTopic = assignedPractice?.settings.topic || null;
  topicSearchQuery = "";
  const searchInput = document.getElementById("mp-topic-search");
  if (searchInput) searchInput.value = "";
  document.getElementById("mp-selected-card").classList.add("hidden");
  document.getElementById("mp-topic-state").textContent = "No topic selected · you can still join an open match.";
  updateQueueInfo();
  document.getElementById("mp-online-note").textContent = "Choose matching practice settings or invite a partner to a private room.";
  applyTrainingContext();
  setTopicBrowserOpen(false);
  await window.mpSupabase.ready;
  const user = await window.VeritasApi.currentUser();
  myUid = user && user.id;
  await loadHotTopics();
  if (!browseForAiDebate) await restorePrivateRoom();
  if (browseForAiDebate) {
    setTopicBrowserOpen(true);
    scrollTopicBrowserIntoView();
    document.getElementById("mp-topic-search")?.focus({ preventScroll: true });
  }
}

async function loadHotTopics() {
  try {
    const today = window.DA.todayStr();
    const data = await window.VeritasApi.tableQuery("hot_topics", query => query
      .select("topics")
      .eq("date", today)
      .maybeSingle(), { timeoutMs: 10000, retrySafe: true, retries: 1 });
    const topics = (data && data.topics && data.topics.length) ? data.topics : FALLBACK_TOPICS;
    allHotTopics = topics;
    activeCategory = "All";
    renderCategoryTabs();
    renderHotTopics(getQuickPickTopics(), "mp-featured-topics");
    renderHotTopics(filterByActiveCategory());
  } catch (e) {
    console.error("Failed to load hot topics, using fallback:", e);
    allHotTopics = FALLBACK_TOPICS;
    activeCategory = "All";
    renderCategoryTabs();
    renderHotTopics(getQuickPickTopics(), "mp-featured-topics");
    renderHotTopics(filterByActiveCategory());
  }
}

function filterByActiveCategory() {
  const query = topicSearchQuery.trim().toLocaleLowerCase();
  return allHotTopics.filter((t) => {
    const matchesCategory = activeCategory === "All" || (t.tag || "Topic") === activeCategory;
    const matchesSearch = !query || `${t.text} ${t.tag || ""}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });
}

function categoryColor(tag) {
  return CATEGORY_COLORS[tag] || DEFAULT_CATEGORY_COLOR;
}

const CATEGORY_ICON_PATHS = {
  All: '<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',
  Tech: '<rect x="5" y="5" width="14" height="14" rx="2"/><path d="M9 9h6v6H9zM9 2v3m6-3v3M9 19v3m6-3v3M2 9h3m-3 6h3m14-6h3m-3 6h3"/>',
  Economics: '<path d="M4 19V5m0 14h17M8 15l4-4 3 2 5-6"/><path d="M16 7h4v4"/>',
  Policy: '<path d="m3 9 9-5 9 5M5 10h14M6 10v8m4-8v8m4-8v8m4-8v8M4 20h16"/>',
  Ethics: '<path d="M12 4v15m-6 1h12M5 7h14M7 7l-4 7h8L7 7Zm10 0-4 7h8l-4-7Z"/>',
  Society: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c.4-3.5 2.4-5.5 6-5.5s5.6 2 6 5.5m0-5c3.7-.7 5.9 1 6.5 4"/>',
  Science: '<path d="M9 3h6m-5 0v6l-5.5 9.2A1.2 1.2 0 0 0 5.5 20h13a1.2 1.2 0 0 0 1-1.8L14 9V3M8 15h8"/>',
  Environment: '<path d="M19 4C9 4 4 8 4 14a6 6 0 0 0 6 6c6 0 9-6 9-16Z"/><path d="M5 19c3-4 6-6 11-9"/>',
  Education: '<path d="m3 8 9-5 9 5-9 5-9-5Zm3 2v6c3.5 3 8.5 3 12 0v-6M21 8v7"/>',
  Work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m-13 5h18m-11-1v3h4v-3"/>',
  Sports: '<path d="M8 21h8m-4-4v4M7 4h10v4a5 5 0 0 1-10 0V4Zm0 2H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
  Culture: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 9h8m-8 4h5"/>'
};
function categoryIcon(category) {
  const path = CATEGORY_ICON_PATHS[category] || '<circle cx="12" cy="12" r="8"/><path d="M8 12h8"/>';
  return `<svg class="mp-category-icon" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

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
    tab.setAttribute("aria-pressed", String(isActive));
    tab.innerHTML = `${categoryIcon(cat)}<span>${escapeHtml(cat)}</span>`;
    tab.addEventListener("click", () => {
      window.DA.playClick();
      activeCategory = cat;
      renderCategoryTabs();
      renderHotTopics(filterByActiveCategory());
    });
    tabsEl.appendChild(tab);
  });
}

const ICON_NEWS = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const ICON_LINK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M10 14L20 4M20 4H14M20 4V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 13V19A1 1 0 0117 20H5A1 1 0 014 19V7A1 1 0 015 6H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderHotTopics(topics, targetId = "mp-hot-topics") {
  const listEl = document.getElementById(targetId);
  listEl.innerHTML = "";
  if (!topics.length) {
    const empty = document.createElement("div");
    empty.className = "hot-topics-empty";
    empty.textContent = "No topics in this category right now — try another tab, or just find a match for a random one.";
    listEl.appendChild(empty);
    return;
  }
  topics.forEach((t) => {
    const tag = t.tag || "Topic";
    const color = categoryColor(tag);
    const hasNews = typeof t.newsUrl === "string" && t.newsUrl.length > 0;

    const card = document.createElement("article");
    card.className = "hot-topic-card";
    const btn = document.createElement("button");
    btn.className = "hot-topic-item";
    btn.type = "button";
    btn.dataset.topic = t.text;
    const isSelected = selectedTopic === t.text;
    btn.classList.toggle("selected", isSelected);
    btn.setAttribute("aria-pressed", String(isSelected));
    btn.innerHTML = `
      <div class="hot-topic-body">
        <div class="hot-topic-head">
          <span class="hot-topic-tag" style="background:${color.bg}; color:${color.text};">
            ${escapeHtml(tag.toUpperCase())}
          </span>
          ${hasNews ? `<span class="hot-topic-news-badge" title="Based on a real news story">${ICON_NEWS} LIVE</span>` : ""}
        </div>
        <div class="hot-topic-title">${escapeHtml(t.text)}</div>
      <span class="hot-topic-action">${isSelected ? "Selected" : ""}</span>
      </div>
    `;
    btn.addEventListener("click", () => selectTopic(t.text));
    card.appendChild(btn);
    if (hasNews) {
      const source = document.createElement("a");
      source.className = "hot-topic-source";
      source.href = t.newsUrl;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      source.innerHTML = `${ICON_LINK} Inspired by ${escapeHtml(t.newsSource || "a news story")}`;
      card.appendChild(source);
    }
    listEl.appendChild(card);
  });
}

function getQuickPickTopics() {
  const picks = [];
  const seenTags = new Set();
  for (const topic of allHotTopics) {
    const tag = topic.tag || "Topic";
    if (seenTags.has(tag)) continue;
    seenTags.add(tag);
    picks.push(topic);
    if (picks.length === 3) break;
  }
  if (picks.length < 3) {
    for (const topic of allHotTopics) {
      if (picks.includes(topic)) continue;
      picks.push(topic);
      if (picks.length === 3) break;
    }
  }
  return picks;
}

function selectTopic(text) {
  window.DA.playClick();
  if (browseForAiDebate) {
    const input = document.getElementById("aidebate-topic-input");
    if (input) input.value = text;
    browseForAiDebate = false;
    window.DA.showScreen("ai-debate");
    input?.focus({ preventScroll: true });
    return;
  }
  selectedTopic = text;
  document.getElementById("mp-selected-text").textContent = text;
  document.getElementById("mp-selected-card").classList.remove("hidden");
  document.getElementById("mp-topic-state").textContent = `Selected topic: ${text}`;
  updateQueueInfo();
  document.querySelectorAll(".hot-topic-item").forEach((el) => {
    const isSelected = el.dataset.topic === selectedTopic;
    el.classList.toggle("selected", isSelected);
    el.setAttribute("aria-pressed", String(isSelected));
    const action = el.querySelector(".hot-topic-action");
    if (action) action.textContent = isSelected ? "Selected ✓" : "";
  });
  setTopicBrowserOpen(false);
}

document.getElementById("mp-clear-topic").addEventListener("click", () => {
  selectedTopic = null;
  document.getElementById("mp-selected-card").classList.add("hidden");
  document.querySelectorAll(".hot-topic-item").forEach((el) => {
    el.classList.remove("selected");
    el.setAttribute("aria-pressed", "false");
    const action = el.querySelector(".hot-topic-action");
    if (action) action.textContent = "";
  });
  document.getElementById("mp-topic-state").textContent = "No topic selected · you can still join an open match.";
  updateQueueInfo();
});

document.getElementById("mp-change-topic").addEventListener("click", () => {
  setTopicBrowserOpen(true);
  scrollTopicBrowserIntoView();
});

function setTopicBrowserOpen(open) {
  const browserEl = document.getElementById("mp-topic-browser");
  const btn = document.getElementById("mp-toggle-topics-btn");
  browserEl.classList.toggle("hidden", !open);
  btn.textContent = open ? "Hide topic browser" : "Browse all topics";
  btn.setAttribute("aria-expanded", String(open));
}

document.getElementById("mp-toggle-topics-btn").addEventListener("click", () => {
  const isOpen = !document.getElementById("mp-topic-browser").classList.contains("hidden");
  setTopicBrowserOpen(!isOpen);
  if (!isOpen) scrollTopicBrowserIntoView();
});

function scrollTopicBrowserIntoView() {
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("mp-topic-browser").scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

function updateQueueInfo() {
  if (assignedPractice) selectedTopic = assignedPractice.settings.topic;
  const label = document.getElementById("mp-queue-type");
  if (!label) return;
  label.textContent = selectedTopic
    ? "Topic-specific match · you’ll be matched with someone on this prompt"
    : "Open match · the queue will choose a topic";
}

const mpBackButton = document.getElementById("mp-back-btn");
mpBackButton?.addEventListener("click", () => {
  if (browseForAiDebate) {
    browseForAiDebate = false;
    window.DA.showScreen("ai-debate");
  } else {
    window.DA.showScreen("home");
  }
});

window.mpBrowseTopicsForAi = () => {
  browseForAiDebate = true;
  window.DA.showScreen("multiplayer");
};

document.addEventListener("click", (event) => {
  const nav = event.target.closest?.("[data-nav]");
  if (browseForAiDebate && nav && nav.dataset.nav !== "multiplayer") {
    browseForAiDebate = false;
  }
}, true);

document.getElementById("mp-topic-search")?.addEventListener("input", (event) => {
  topicSearchQuery = event.currentTarget.value;
  renderHotTopics(filterByActiveCategory());
});


function practiceSettings() {
  if (assignedPractice) return assignedPractice.settings;
  return trainingSettings({ mode: document.getElementById('mp-practice-mode').value, speech_seconds: Number(document.getElementById('mp-speech-seconds').value), turns: Number(document.getElementById('mp-turns').value) });
}
function applyTrainingContext() {
  const settings = practiceSettings();
  ['mode', 'speech-seconds', 'turns'].forEach((suffix, i) => { const el = document.getElementById(`mp-${suffix === 'mode' ? 'practice-mode' : suffix}`); el.value = String([settings.mode, settings.speech_seconds, settings.turns][i]); el.disabled = !!assignedPractice; });
  document.getElementById('mp-find-match-btn').classList.toggle('hidden', assignedPractice?.kind === 'private_debate');
  document.getElementById('mp-private-panel').classList.toggle('hidden', browseForAiDebate || assignedPractice?.kind === 'live_debate');
  document.getElementById('mp-private-topic').value = assignedPractice?.settings.topic || selectedTopic || '';
  document.getElementById('mp-private-topic').readOnly = !!assignedPractice;
  document.getElementById('mp-private-context').textContent = assignedPractice ? `Assigned motion: ${assignedPractice.settings.topic}. Both partners must open this assignment before joining.` : 'Invite a partner with the room code. Private practice does not change global Elo.';
}
window.mpStartAssignedDebate = async assignment => {
  clearInterval(privatePoll); privatePoll = null; privateRoom = null; browseForAiDebate = false;
  await cancelSearch(); assignedPractice = { id: assignment.id, kind: assignment.kind, settings: trainingSettings({ ...assignment.activity_settings, topic: assignment.activity_settings?.topic || assignment.title }) };
  window.DA.showScreen('multiplayer');
};
window.mpClearAssignedDebate = () => { assignedPractice = null; applyTrainingContext(); };
async function restorePrivateRoom() {
  if (!myUid) return;
  const key = `veritas:private-room:${myUid}`;
  let saved; try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { sessionStorage.removeItem(key); return; }
  if (!saved || (saved.assignmentId || null) !== (assignedPractice?.id || null)) return;
  try {
    const room = await window.VeritasApi.tableQuery('private_debate_rooms', q => q.select('*').eq('id', saved.id).maybeSingle(), { timeoutMs: 10000 });
    if (!room || room.closed || (!room.debate_id && Date.parse(room.expires_at) < Date.now())) { sessionStorage.removeItem(key); return; }
    privateRoom = room; document.getElementById('mp-private-code').value = room.code;
    if (room.debate_id) {
      const debate = await window.VeritasApi.tableQuery('debates', q => q.select('status').eq('id', room.debate_id).maybeSingle());
      if (debate?.status === 'active') { enterDebateRoom(room.debate_id); return; }
      sessionStorage.removeItem(key); privateRoom = null; return;
    }
    document.getElementById('mp-private-status').textContent = `Room ${room.code}. Waiting for your partner to join…`;
    clearInterval(privatePoll); privatePoll = setInterval(checkPrivateRoom, 2000);
  } catch { document.getElementById('mp-private-status').textContent = 'Could not restore your room. Enter its code to rejoin.'; document.getElementById('mp-private-code').value = saved.code || ''; }
}
async function checkPrivateRoom() {
  if (!privateRoom || privateRoom.debate_id) return;
  try {
    const room = await window.VeritasApi.tableQuery('private_debate_rooms', q => q.select('*').eq('id', privateRoom.id).single(), { timeoutMs: 10000 });
    if (room?.debate_id) { privateRoom = room; enterDebateRoom(room.debate_id); }
    else if (room?.closed || Date.parse(room?.expires_at) < Date.now()) { clearInterval(privatePoll); privatePoll = null; document.getElementById('mp-private-status').textContent = 'Room expired or closed. Create another room.'; }
  } catch { document.getElementById('mp-private-status').textContent = 'Connection lost. Your room code is still available; retry joining.'; }
}
async function openPrivateRoom(join) {
  if (joiningPrivate) return;
  joiningPrivate = true; const status = document.getElementById('mp-private-status');
  try {
    await cancelSearch(); await window.mpSupabase.ready; const user = await window.VeritasApi.currentUser(); if (!user) throw Error('Sign in first.'); myUid = user.id;
    if (privateRoom && !privateRoom.debate_id && !join) await window.VeritasApi.rpc('close_private_debate_room', { p_room_id: privateRoom.id });
    const room = await window.VeritasApi.rpc(join ? 'join_private_debate_room' : 'create_private_debate_room', join ? { p_code: document.getElementById('mp-private-code').value.trim(), p_assignment_id: assignedPractice?.id || null } : { p_assignment_id: assignedPractice?.id || null, p_topic: document.getElementById('mp-private-topic').value.trim(), p_settings: practiceSettings() });
    privateRoom = room; sessionStorage.setItem(`veritas:private-room:${myUid}`, JSON.stringify({ id: room.id, code: room.code, assignmentId: room.assignment_id }));
    document.getElementById('mp-private-code').value = room.code; status.textContent = `Room ${room.code}. Waiting for your partner to join…`;
    if (room.debate_id) enterDebateRoom(room.debate_id);
    else { clearInterval(privatePoll); privatePoll = setInterval(checkPrivateRoom, 2000); await checkPrivateRoom(); }
  } catch (error) { status.textContent = error.message || 'Could not open the private room.'; }
  finally { joiningPrivate = false; }
}
document.getElementById('mp-private-create').onclick = () => openPrivateRoom(false);
document.getElementById('mp-private-join').onclick = () => openPrivateRoom(true);
document.getElementById('mp-private-copy').onclick = async () => { try { await navigator.clipboard.writeText(document.getElementById('mp-private-code').value); window.DA.toast('Room code copied.'); } catch { window.DA.toast('Select the room code and copy it.'); } };
document.addEventListener('click', event => { if (event.target.closest?.('[data-nav], #debate-exit-btn, #debate-done-btn')) { speech.reset(); } });

/* ---------------------------------------------------------
   MATCHMAKING
   --------------------------------------------------------- */

document.getElementById("mp-find-match-btn").addEventListener("click", startSearch);
document.getElementById("mp-cancel-search-btn").addEventListener("click", cancelSearch);

async function startSearch() {
  if (assignedPractice?.kind === "private_debate") { window.DA.toast("Create or join the assignment’s private room."); return; }
  if (inQueue) return;
  window.DA.playClick();
  await window.mpSupabase.ready;
  const user = await window.VeritasApi.currentUser();
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
  startSearchClock();
  // A completed match leaves the caller's matched row behind. Clear only
  // our own row before inserting the next queue entry (there is no UPDATE
  // policy by design).
  try {
    await window.VeritasApi.tableQuery("match_queue", query => query.delete().eq("uid", myUid), { timeoutMs: 10000 });
  } catch {
    inQueue = false; stopSearchClock();
    document.getElementById("mp-searching-state").classList.add("hidden");
    document.getElementById("mp-browse-state").classList.remove("hidden");
    window.DA.toast("Could not join the match queue. Check your connection and try again.");
    return;
  }
  try {
    await window.VeritasApi.rpc("join_training_queue", { p_topic: selectedTopic || null, p_settings: practiceSettings() }, { timeoutMs: 10000 });
  } catch {
    inQueue = false; stopSearchClock();
    document.getElementById("mp-searching-state").classList.add("hidden");
    document.getElementById("mp-browse-state").classList.remove("hidden");
    window.DA.toast("Could not join the match queue. Check your connection and try again.");
    return;
  }

  queueChannel = window.VeritasApi.realtimeChannel(`queue-${myUid}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "match_queue", filter: `uid=eq.${myUid}` },
      (payload) => {
        const row = payload.new;
        if (row && row.status === "matched" && row.debate_id) {
          stopPolling();
          if (queueChannel) { window.VeritasApi.removeRealtimeChannel(queueChannel); queueChannel = null; }
          enterDebateRoom(row.debate_id);
        }
      }
    )
    .subscribe();

  attemptMatch();
  matchPollTimer = setInterval(attemptMatch, 2500);
}

let searchClock = null;
let searchStartedAt = 0;

// The queue screen had no sense of time passing, so a slow match felt broken.
function startSearchClock() {
  stopSearchClock();
  searchStartedAt = Date.now();
  const paint = () => {
    const el = document.getElementById("mp-search-elapsed");
    if (!el) return;
    const secs = Math.floor((Date.now() - searchStartedAt) / 1000);
    el.textContent = fmtClock(secs);
    const note = document.getElementById("mp-online-note");
    if (note && secs === 25) note.textContent = "Still searching — quiet queue right now. Hang tight or cancel and try a different topic.";
  };
  paint();
  searchClock = window.setInterval(paint, 1000);
}

function stopSearchClock() {
  if (searchClock) { clearInterval(searchClock); searchClock = null; }
}

async function cancelSearch() {
  window.DA.playClick();
  stopSearchClock();
  stopPolling();
  inQueue = false;
  if (queueChannel) { window.VeritasApi.removeRealtimeChannel(queueChannel); queueChannel = null; }
  if (myUid) {
    try { await window.VeritasApi.tableQuery("match_queue", query => query.delete().eq("uid", myUid), { timeoutMs: 10000 }); } catch { /* best-effort queue cleanup */ }
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
    const debateId = await window.VeritasApi.rpc("attempt_match", { p_fallback_topic: fallback }, { timeoutMs: 10000, retrySafe: true, retries: 1 });
    if (debateId && inQueue) { stopPolling(); if (queueChannel) { window.VeritasApi.removeRealtimeChannel(queueChannel); queueChannel = null; } enterDebateRoom(debateId); }
  } catch (e) {
    // Transient conflict, or nobody else waiting yet — just retry on next poll.
  }
}

/* ---------------------------------------------------------
   DEBATE ROOM
   --------------------------------------------------------- */

function enterDebateRoom(debateId) {
  if (currentDebateId === debateId && debateChannel) return;
  if (debateChannel) window.VeritasApi.removeRealtimeChannel(debateChannel);
  clearInterval(privatePoll); privatePoll = null;
  speech.reset(); currentDebateData = null;
  inQueue = false;
  stopSearchClock();
  currentDebateId = debateId;
  opponentName = "Opponent";   // reset until we fetch the real name
  opponentElo = 1200;          // reset until we fetch the real ELO
  
  // Store the user's ELO rating before the debate starts so we can show the delta at the end
  initialElo = window.DA.getCachedProfile().eloRating;
  if (initialElo === null) {
    window.DA.fetchProfile().then(() => {
      initialElo = window.DA.getCachedProfile().eloRating;
      renderDebateRoom();
    });
  }

  window.DA.showScreen("debate-room");
  document.getElementById("debate-ended-panel").classList.add("hidden");
  document.getElementById("debate-composer").classList.add("hidden");
  document.getElementById("debate-live-status").textContent = "Loading practice room…";
  syncedTurnCount = -1;
  lastTimedTurnIndex = null;
  const resignEl = document.getElementById("debate-resign-btn");
  if (resignEl) resignEl.classList.remove("hidden");
  document.querySelectorAll(".rate-btn").forEach((b) => b.classList.remove("picked"));
  const draft = document.getElementById("debate-input");
  if (draft) { draft.value = ""; }
  updateWordCount();

  window.VeritasApi.tableQuery("debates", query => query.select("*").eq("id", debateId).single(), { timeoutMs: 10000, retrySafe: true, retries: 1 }).then(data => {
    if (currentDebateId !== debateId) return;
    if (data) {
      currentDebateData = rowToDebateData(data);
      speech.configure(currentDebateData.practiceMode, currentDebateData.speechSeconds);
      updateWordCount();
      renderDebateRoom();

      // Fetch the opponent's display_name and elo_rating from the profiles table.
      // Best-effort: if it fails we just keep showing defaults.
      const theirUid = (data.player_order || []).find((u) => u !== myUid);
      if (theirUid) {
        window.VeritasApi.tableQuery("profiles", query => query
          .select("display_name, elo_rating")
          .eq("uid", theirUid)
          .maybeSingle(), { timeoutMs: 10000, retrySafe: true, retries: 1 })
          .then(p => {
            if (currentDebateId !== debateId) return;
            if (p) {
              if (p.display_name) opponentName = p.display_name;
              if (p.elo_rating !== undefined && p.elo_rating !== null) opponentElo = p.elo_rating;
              renderDebateRoom();   // re-render with the real name and ELO
            }
          })
          .catch((e) => console.warn("Could not fetch opponent name and ELO:", e));
      }
    }
  }).catch(error => { if (currentDebateId === debateId) { document.getElementById("debate-live-status").textContent = "Could not load this room. Return to the lobby and rejoin using the room code."; window.DA.toast(error.message); } });

  debateChannel = window.VeritasApi.realtimeChannel(`debate-${debateId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "debates", filter: `id=eq.${debateId}` },
      (payload) => {
        if (currentDebateId !== debateId) return;
        currentDebateData = rowToDebateData(payload.new);
        syncServerClock(currentDebateData);
        renderDebateRoom();
      }
    )
    .subscribe();
}

function initial(name) {
  const n = (name || "?").trim();
  return (n[0] || "?").toUpperCase();
}

function renderDebateRoom() {
  if (!currentDebateData) return;
  const data = currentDebateData || { topic: "Unknown topic", turns: [], maxTurnsPerPlayer: MAX_TURNS_PER_PLAYER, playerOrder: [] };
  const turns = Array.isArray(data.turns) ? data.turns : [];
  const myName = window.DA.getCachedProfile().displayName || "You";

  /* --- Clock strip -------------------------------------------------- */
  const used = thinkTimes(data);
  const theirUid = (data.playerOrder || []).find((u) => u !== myUid);
  const setText = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
  setText("debate-self-elo", String(initialElo !== null ? initialElo : 1200));
  setText("debate-opp-elo", String(opponentElo));
  setText("debate-opp-name", opponentName);
  setText("debate-self-avatar", initial(myName));
  setText("debate-opp-avatar", initial(opponentName));
  setText("debate-self-used", fmtClock(used[myUid] || 0));
  setText("debate-opp-used", fmtClock(used[theirUid] || 0));

  setText("debate-topic-label", data.topic || "Unknown topic");

  const totalTurns = data.maxTurnsPerPlayer * 2;
  document.getElementById("debate-progress-fill").style.width =
    Math.min(100, (turns.length / totalTurns) * 100) + "%";
  setText("debate-round-label", `Turn ${Math.min(turns.length + 1, totalTurns)} of ${totalTurns}`);

  /* --- Transcript --------------------------------------------------- */
  const wrap = document.getElementById("debate-transcript");
  const previousTurns = new Set([...wrap.querySelectorAll("[id]")].map(el => el.id));
  wrap.innerHTML = "";
  if (!turns.length) {
    const hint = document.createElement("div");
    hint.className = "debate-bubble theirs";
    hint.innerHTML = `<div class="debate-bubble-meta">Live match</div><div>${data.playerOrder[0] === myUid ? "Start strong — you have the first move." : "Opponent is about to begin the first argument."}</div>`;
    wrap.appendChild(hint);
  }
  // Turn numbers are per player. They used to be the flat transcript index, so
  // your second argument was labelled "Turn 3" of your three.
  const seen = {};
  turns.forEach((t, i) => {
    const mine = t.uid === myUid;
    seen[t.uid] = (seen[t.uid] || 0) + 1;
    const spent = turnSpent(data, i);
    const stamp = typeof t.ts === "number" ? fmtTimeOfDay(t.ts) : "";
    const meta = [
      mine ? "You" : escapeHtml(opponentName),
      `Turn ${seen[t.uid]} of ${data.maxTurnsPerPlayer}`,
      stamp,
      spent !== null ? `took ${Math.round(spent)}s` : ""
    ].filter(Boolean).join(" · ");
    const bubble = document.createElement("div");
    bubble.className = "debate-bubble " + (mine ? "mine" : "theirs");
    bubble.id = `debate-turn-${i}`;
    if (!previousTurns.has(bubble.id)) bubble.classList.add("new-message");
    bubble.innerHTML = `<div class="debate-bubble-meta">${meta}</div><div>${escapeHtml(t.text)}</div>`;
    if (t.audioPath) appendRecording(bubble, t.audioPath);
    wrap.appendChild(bubble);
  });
  wrap.scrollTop = wrap.scrollHeight;

  renderTurnLog(data, turns);

  const pill = document.getElementById("debate-turn-pill");
  const composer = document.getElementById("debate-composer");
  const waiting = document.getElementById("debate-waiting");

  if (data.status !== "active") {
    pill.textContent = "Debate over";
    pill.className = "debate-turn-pill";
    composer.classList.add("hidden");
    waiting.classList.add("hidden");
    const resign = document.getElementById("debate-resign-btn");
    if (resign) resign.classList.add("hidden");
    stopTurnTimer();
    paintClocks(data, null);
    showDebateEnded();
    return;
  }

  const whoseTurnUid = data.playerOrder[data.turnIndex % 2];
  const myTurn = whoseTurnUid === myUid;
  pill.textContent = myTurn ? "Your turn" : `${opponentName}'s turn`;
  pill.className = "debate-turn-pill " + (myTurn ? "mine" : "theirs");
  const status = document.getElementById("debate-live-status");
  if (status) { status.textContent = myTurn ? "Your turn — make your next argument." : `${opponentName}'s turn — waiting for their argument.`; status.dataset.state = myTurn ? "ready" : "waiting"; }
  composer.classList.toggle("hidden", !myTurn);
  waiting.classList.toggle("hidden", myTurn);
  document.getElementById("debate-waiting-message").textContent = myTurn
    ? `${opponentName} is waiting on your next argument.`
    : WAIT_MESSAGES[turns.length % WAIT_MESSAGES.length];

  // One ticker drives both clocks for either player's turn, so you can watch
  // your opponent's time run down instead of staring at a dash.
  if (lastTimedTurnIndex !== data.turnIndex) {
    const becameMyTurn = myTurn && lastTimedTurnIndex !== null;
    lastTimedTurnIndex = data.turnIndex;
    if (becameMyTurn) {
      try { window.DA.playClick(); } catch (e) { /* sound is optional */ }
      const el = document.getElementById("clock-self");
      if (el) { el.classList.remove("just-became-active"); void el.offsetWidth; el.classList.add("just-became-active"); }
      const input = document.getElementById("debate-input");
      if (input) input.focus();
    }
    speech.reset();
    beginTurnTimer();
  }
}

function renderTurnLog(data, turns) {
  const log = document.getElementById("debate-turn-log");
  if (!log) return;
  log.innerHTML = "";
  if (!turns.length) {
    const li = document.createElement("li");
    li.className = "turn-log-empty";
    li.textContent = "No arguments yet.";
    log.appendChild(li);
    return;
  }
  const seen = {};
  turns.forEach((t, i) => {
    const mine = t.uid === myUid;
    seen[t.uid] = (seen[t.uid] || 0) + 1;
    const spent = turnSpent(data, i);
    const li = document.createElement("li");
    li.className = "turn-log-row" + (mine ? " mine" : "");
    li.innerHTML = `
      <span class="turn-log-who">${mine ? "You" : escapeHtml(opponentName)}</span>
      <span class="turn-log-n">#${seen[t.uid]}</span>
      <span class="turn-log-time">${spent !== null ? Math.round(spent) + "s" : "—"}</span>`;
    li.addEventListener("click", () => {
      const target = document.getElementById(`debate-turn-${i}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("flash");
        window.setTimeout(() => target.classList.remove("flash"), 900);
      }
    });
    log.appendChild(li);
  });
}

// Paints both clock faces. activeUid null = match over, both faces idle.
function paintClocks(data, activeUid) {
  const theirUid = (data.playerOrder || []).find((u) => u !== myUid);
  const deadline = turnDeadline(data);
  const remaining = deadline !== null ? Math.max(0, (deadline - serverNow()) / 1000) : TURN_SECONDS;

  [[myUid, "clock-self", "debate-self-clock"], [theirUid, "clock-opp", "debate-opp-clock"]]
    .forEach(([uid, rowId, timeId]) => {
      const row = document.getElementById(rowId);
      const face = document.getElementById(timeId);
      if (!row || !face) return;
      const isActive = activeUid !== null && uid === activeUid;
      face.textContent = isActive ? fmtClock(remaining) : fmtClock(data.turnSeconds || TURN_SECONDS);
      row.classList.toggle("running", isActive);
      row.classList.toggle("urgent", isActive && remaining <= 8);
      row.classList.toggle("idle", !isActive);
    });
  return remaining;
}

document.getElementById("debate-send-btn").addEventListener("click", sendTurn);

let sending = false;

async function sendTurn() {
  if (sending) return;                       // the button stayed live during a
  const input = document.getElementById("debate-input");   // slow RPC, so a
  const btn = document.getElementById("debate-send-btn");  // double-click could
  const text = input.value.trim();                          // fire two turns.
  if (!text || !currentDebateId) return;
  if (text.length < 12) {
    window.DA.toast("Make it an argument — at least a sentence.");
    return;
  }
  sending = true;
  const expectedTurn = currentDebateData?.turnIndex;
  const debateId = currentDebateId;
  window.DA.playClick();
  input.disabled = true;
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  try {
    const audioPath = await speech.save({ debateId, assignmentId: currentDebateData?.assignmentId || assignedPractice?.id || null });
    await window.VeritasApi.rpc("submit_training_turn", { p_debate_id: debateId, p_text: text, p_audio_path: audioPath, p_expected_turn: expectedTurn }, { timeoutMs: 15000 });
    speech.reset();
    input.value = "";
    updateWordCount();
  } catch (e) {
    window.DA.toast(e.message || "Couldn't send — try again.");
  }
  input.disabled = false;
  if (btn) { btn.disabled = false; btn.textContent = "Send Argument"; }
  sending = false;
}

function updateWordCount() {
  const input = document.getElementById("debate-input");
  const out = document.getElementById("debate-word-count");
  if (!input || !out) return;
  const words = input.value.trim() ? input.value.trim().split(/\s+/).length : 0;
  const left = input.maxLength - input.value.length;
  out.textContent = `${words} word${words === 1 ? "" : "s"} · ${left} left`;
  out.classList.toggle("low", left < 60);
}

(function wireComposer() {
  const input = document.getElementById("debate-input");
  if (!input) return;
  input.addEventListener("input", updateWordCount);
  // Parity with the AI room, which already had this shortcut.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      sendTurn();
    }
  });
})();

function beginTurnTimer() {
  stopTurnTimer();
  tickTurnTimer();
  turnTimer = window.setInterval(tickTurnTimer, 250);
}

/* Reads the deadline off the server's last_turn_at every tick instead of
   decrementing a local counter. Previously a reload, a backgrounded tab, or a
   late realtime event each handed the player a fresh 30 seconds, and the two
   players' clocks drifted apart over a match. Ticking at 250ms also keeps the
   display honest when the browser throttles timers in a background tab. */
function tickTurnTimer() {
  const data = currentDebateData;
  if (!data || data.status !== "active") { stopTurnTimer(); return; }
  const activeUid = (data.playerOrder || [])[data.turnIndex % 2];
  const remaining = paintClocks(data, activeUid);
  turnRemaining = remaining;
  if (remaining <= 0) {
    stopTurnTimer();
    // Only the player who actually ran out asks the server to record the pass,
    // so two open tabs can't both fire it.
    speech.reset();
    submitTimeoutTurn();
  }
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
    await window.VeritasApi.rpc("submit_timeout_turn", { p_debate_id: currentDebateId }, { timeoutMs: 10000 });
  } catch (e) {
    console.warn("timeout pass failed", e);
  }
}

/* ---------------------------------------------------------
   RESIGN
   A live match previously had no way out but closing the tab,
   which left the opponent hanging until the 5-minute stale
   sweep. Resigning passes out the rest of your turns so the
   debate completes immediately and the referee still scores
   whatever was argued.
   --------------------------------------------------------- */
let resigning = false;

async function resignMatch() {
  if (resigning || !currentDebateId || !currentDebateData) return;
  if (currentDebateData.status !== "active") return;
  if (!window.confirm("Resign this match? Your remaining turns are forfeited and the referee scores what's been argued so far.")) return;
  resigning = true;
  const btn = document.getElementById("debate-resign-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Resigning…"; }
  stopTurnTimer();
  try {
    speech.reset();
    await window.VeritasApi.rpc('resign_training_debate', { p_debate_id: currentDebateId }, { timeoutMs: 15000 });
    window.DA.toast("Match resigned.");
  } catch (e) {
    window.DA.toast("Couldn't resign — check your connection.");
  }
  if (btn) { btn.disabled = false; btn.textContent = "Resign match"; }
  resigning = false;
}

// AI verdicts are written by the ai-referee Edge Function, triggered
// from Postgres itself the instant a debate flips to 'completed' (see
// supabase/migrations/0002_ai_referee.sql) — so it can land a beat or
// two after the client first sees status flip. getRefereeVerdict()
// always has something to show immediately (the heuristic estimate)
// and upgrades to the real verdict once ai_verdict arrives over the
// existing debate-row subscription, with no extra polling needed.
function getRefereeVerdict(data) {
  if (data.aiVerdict) return aiVerdictToDisplay(data);
  const heuristic = heuristicVerdict(data);
  heuristic.pending = true;
  return heuristic;
}

function aiVerdictToDisplay(data) {
  const v = data.aiVerdict;
  const scores = v.scores || {};
  const myScore = Math.round(scores[myUid] ?? 0);
  const theirUid = (data.playerOrder || []).find((u) => u !== myUid);
  const theirScore = Math.round(scores[theirUid] ?? 0);

  let title = "Tie match";
  if (v.winnerUid === myUid) title = "Your side wins";
  else if (v.winnerUid && v.winnerUid !== myUid) title = `${opponentName} wins`;

  const comment = `${v.summary || ""} Score: You ${myScore} — ${opponentName} ${theirScore}.`.trim();
  return { title, comment, pending: false };
}

function heuristicVerdict(data) {
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
  const firstShow = panel.classList.contains("hidden");
  document.getElementById("debate-rematch-btn").textContent = currentDebateData?.isPrivate ? "New private room" : "Rematch";
  if (firstShow) {
    if (currentDebateData?.isPrivate && myUid) sessionStorage.removeItem(`veritas:private-room:${myUid}`);
    window.classroomActivityComplete?.(currentDebateData?.isPrivate ? 'private_debate' : 'live_debate', {
      id: currentDebateId,
      transcript: (currentDebateData?.turns || []).map(t => ({ uid: t.uid, text: t.text, audioPath: t.audioPath || null })),
      assignmentId: currentDebateData?.assignmentId || assignedPractice?.id || null
    });
    panel.classList.remove("hidden");
    window.DA.awardXp(60);
    window.DA.toast("+60 XP for completing a live debate!");
    xpBonusAwarded = false;
  }
  renderRefereeVerdict();
}

// Called on every debate-room render while the ended panel is showing
// (including the postgres_changes UPDATE that lands ai_verdict), so the
// panel silently upgrades from "referee is reviewing" to the real
// verdict without the player having to do anything.
let xpBonusAwarded = false;

function renderRefereeVerdict() {
  const referee = getRefereeVerdict(currentDebateData || {});
  const status = document.getElementById("debate-live-status");
  if (status) { status.textContent = referee.pending ? "Debate complete — referee reviewing arguments…" : "Feedback ready — review the verdict below."; status.dataset.state = referee.pending ? "waiting" : "complete"; }
  // The completion XP used to be flat, so winning and being flattened paid the
  // same. The win bonus lands once, when the real verdict arrives.
  if (!referee.pending && !xpBonusAwarded && currentDebateData && currentDebateData.aiVerdict) {
    xpBonusAwarded = true;
    if (currentDebateData.aiVerdict.winnerUid === myUid) {
      window.DA.awardXp(40, { trackActivity: false, trackRun: false });
      window.DA.toast("+40 XP win bonus!");
    }
  }
  const label = document.querySelector(".referee-label");
  document.getElementById("debate-ended-sub").textContent = referee.title;
  document.getElementById("debate-referee-comment").textContent = referee.pending
    ? `${referee.comment} (Full AI referee verdict is still being calculated — this will update automatically.)`
    : referee.comment;
  if (label) label.classList.toggle("referee-pending", !!referee.pending);

  // If the verdict is complete, fetch the updated ELO from the server and show the delta
  const eloChangeEl = document.getElementById("debate-elo-change");
  if (eloChangeEl) {
    if (!referee.pending && !currentDebateData?.isPrivate) {
      window.DA.fetchProfile().then(() => {
        const newElo = window.DA.getCachedProfile().eloRating;
        if (newElo !== null) {
          if (initialElo !== null) {
            const delta = newElo - initialElo;
            const sign = delta >= 0 ? "+" : "";
            eloChangeEl.textContent = `Rating: ${newElo} ELO (${sign}${delta})`;
            eloChangeEl.className = "debate-elo-change " + (delta > 0 ? "gain" : delta < 0 ? "loss" : "");
          } else {
            eloChangeEl.textContent = `Rating: ${newElo} ELO`;
            eloChangeEl.className = "debate-elo-change";
          }
          eloChangeEl.classList.remove("hidden");
        }
      }).catch((e) => console.warn("Failed to fetch final ELO:", e));
    } else {
      eloChangeEl.classList.add("hidden");
    }
  }
}

document.querySelectorAll(".rate-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    document.querySelectorAll(".rate-btn").forEach((b) => b.classList.remove("picked"));
    btn.classList.add("picked");
    if (!currentDebateId || !myUid) return;
    try {
      await window.VeritasApi.rpc("submit_rating", { p_debate_id: currentDebateId, p_rating: btn.dataset.rate }, { timeoutMs: 10000 });
    } catch (e) { /* non-critical */ }
  });
});

const resignBtn = document.getElementById("debate-resign-btn");
if (resignBtn) resignBtn.addEventListener("click", resignMatch);

const rematchBtn = document.getElementById("debate-rematch-btn");
if (rematchBtn) rematchBtn.addEventListener("click", () => {
  // Keep the topic so a rematch is a rematch, then drop straight back into
  // the queue rather than making the player walk home and start over.
  const topic = currentDebateData && currentDebateData.topic;
  const previous = currentDebateData;
  speech.reset();
  window.DA.playClick();
  stopTurnTimer();
  lastTimedTurnIndex = null;
  if (debateChannel) { window.VeritasApi.removeRealtimeChannel(debateChannel); debateChannel = null; }
  currentDebateId = null;
  currentDebateData = null;
  window.DA.showScreen("multiplayer");
  openLobby().then(() => {
    if (topic) {
      selectedTopic = topic;
      const sel = document.getElementById("mp-selected-card");
      const txt = document.getElementById("mp-selected-text");
      if (txt) txt.textContent = topic;
      if (sel) sel.classList.remove("hidden");
    }
    if (previous?.isPrivate) {
      document.getElementById('mp-private-topic').value = topic || '';
      if (!assignedPractice) {
        document.getElementById('mp-practice-mode').value = previous.practiceMode;
        document.getElementById('mp-speech-seconds').value = String(previous.speechSeconds);
        document.getElementById('mp-turns').value = String(previous.maxTurnsPerPlayer);
      }
      openPrivateRoom(false);
    } else startSearch();
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
  if (debateChannel) { window.VeritasApi.removeRealtimeChannel(debateChannel); debateChannel = null; }
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
