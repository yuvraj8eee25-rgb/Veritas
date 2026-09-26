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
  return anchor + TURN_SECONDS * 1000;
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
      const spent = Math.max(0, Math.min(TURN_SECONDS * 1000, t.ts - prev)) / 1000;
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
  return Math.max(0, Math.min(TURN_SECONDS, (t.ts - prev) / 1000));
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

const ICON_NEWS = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>';
const ICON_LINK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M10 14L20 4M20 4H14M20 4V10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 13V19A1 1 0 0117 20H5A1 1 0 014 19V7A1 1 0 015 6H11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function renderHotTopics(topics) {
  const listEl = document.getElementById("mp-hot-topics");
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
    const { pro, players } = pseudoStats(t.text);
    const con = 100 - pro;
    const hasNews = typeof t.newsUrl === "string" && t.newsUrl.length > 0;

    const btn = document.createElement("button");
    btn.className = "hot-topic-item";
    btn.type = "button";
    btn.innerHTML = `
      <div class="hot-topic-body">
        <div class="hot-topic-head">
          <span class="hot-topic-tag" style="background:${color.bg}; color:${color.text};">
            ${escapeHtml(tag.toUpperCase())}
          </span>
          ${hasNews ? `<span class="hot-topic-news-badge" title="Based on a real news story">${ICON_NEWS} LIVE</span>` : ""}
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
        ${hasNews ? `
          <a class="hot-topic-source" href="${escapeHtml(t.newsUrl)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation();">
            ${ICON_LINK} Inspired by ${escapeHtml(t.newsSource || "a news story")}
          </a>` : ""}
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
  startSearchClock();
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
  document.getElementById("debate-composer").classList.remove("hidden");
  syncedTurnCount = -1;
  lastTimedTurnIndex = null;
  const resignEl = document.getElementById("debate-resign-btn");
  if (resignEl) resignEl.classList.remove("hidden");
  document.querySelectorAll(".rate-btn").forEach((b) => b.classList.remove("picked"));
  const draft = document.getElementById("debate-input");
  if (draft) { draft.value = ""; }
  updateWordCount();

  sb().from("debates").select("*").eq("id", debateId).single().then(({ data }) => {
    if (data) {
      currentDebateData = rowToDebateData(data);
      renderDebateRoom();

      // Fetch the opponent's display_name and elo_rating from the profiles table.
      // Best-effort: if it fails we just keep showing defaults.
      const theirUid = (data.player_order || []).find((u) => u !== myUid);
      if (theirUid) {
        sb()
          .from("profiles")
          .select("display_name, elo_rating")
          .eq("uid", theirUid)
          .maybeSingle()
          .then(({ data: p }) => {
            if (p) {
              if (p.display_name) opponentName = p.display_name;
              if (p.elo_rating !== undefined && p.elo_rating !== null) opponentElo = p.elo_rating;
              renderDebateRoom();   // re-render with the real name and ELO
            }
          })
          .catch((e) => console.warn("Could not fetch opponent name and ELO:", e));
      }
    }
  });

  debateChannel = sb()
    .channel(`debate-${debateId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "debates", filter: `id=eq.${debateId}` },
      (payload) => {
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
      face.textContent = isActive ? fmtClock(remaining) : fmtClock(TURN_SECONDS);
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
  window.DA.playClick();
  input.disabled = true;
  if (btn) { btn.disabled = true; btn.textContent = "Sending…"; }
  try {
    const { error } = await sb().rpc("submit_turn", { p_debate_id: currentDebateId, p_text: text });
    if (error) throw error;
    input.value = "";
    updateWordCount();
  } catch (e) {
    window.DA.toast("Couldn't send — try again.");
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
  const left = 600 - input.value.length;
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
    if (activeUid === myUid) submitTimeoutTurn();
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
    await sb().rpc("submit_timeout_turn", { p_debate_id: currentDebateId });
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
    const total = currentDebateData.maxTurnsPerPlayer * 2;
    // Pass repeatedly until the debate closes. submit_timeout_turn() rejects a
    // pass that isn't the caller's turn, so this only ever burns our own turns
    // and the opponent's realtime subscription sees each one land.
    for (let i = currentDebateData.turns.length; i < total; i++) {
      const activeUid = currentDebateData.playerOrder[currentDebateData.turnIndex % 2];
      if (activeUid !== myUid) break;
      await sb().rpc("submit_timeout_turn", { p_debate_id: currentDebateId });
      await new Promise((r) => window.setTimeout(r, 120));
      if (!currentDebateData || currentDebateData.status !== "active") break;
    }
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
  if (firstShow) {
    window.classroomActivityComplete?.('live_debate', {
      id: currentDebateId,
      transcript: (currentDebateData?.turns || []).map(t => ({ uid: t.uid, text: t.text }))
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
      window.DA.awardXp(40);
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
    if (!referee.pending) {
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
      await sb().rpc("submit_rating", { p_debate_id: currentDebateId, p_rating: btn.dataset.rate });
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
  window.DA.playClick();
  stopTurnTimer();
  lastTimedTurnIndex = null;
  if (debateChannel) { sb().removeChannel(debateChannel); debateChannel = null; }
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
    startSearch();
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
