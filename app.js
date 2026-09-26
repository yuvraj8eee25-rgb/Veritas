/* =========================================================
   VERITAS — App Logic
   ========================================================= */

(function () {
"use strict";

/* ---------------------------------------------------------
   0. QUESTION DATA
   --------------------------------------------------------- */

const FALLACY_QUESTIONS = [
  { id: "f1", difficulty: "easy",
    prompt: "\u201cYou can't trust Maria's opinion on the new traffic law \u2014 she got a speeding ticket last year.\u201d",
    options: ["Ad Hominem", "False Dilemma", "Slippery Slope", "Appeal to Authority"],
    correct: 0,
    explain: "This attacks Maria's character (a past ticket) instead of addressing her actual argument about the law.",
    tip: "Ask: does this response engage with the claim, or with the person making it? If it's the person, it's ad hominem." },
  { id: "f2", difficulty: "easy",
    prompt: "\u201cEither we ban all cars downtown, or the city stays polluted forever. There's no other option.\u201d",
    options: ["Hasty Generalization", "False Dilemma", "Red Herring", "Circular Reasoning"],
    correct: 1,
    explain: "This presents only two extreme outcomes when many middle-ground policies (emissions zones, transit investment) exist.",
    tip: "Look for words like 'either/or' or 'only choice' \u2014 they often hide unexplored middle options." },
  { id: "f3", difficulty: "easy",
    prompt: "\u201cI asked three friends and they all hate the new phone, so clearly everyone hates it.\u201d",
    options: ["Hasty Generalization", "Appeal to Authority", "Straw Man", "Slippery Slope"],
    correct: 0,
    explain: "Three friends is far too small and non-representative a sample to conclude 'everyone' feels a certain way.",
    tip: "Small, non-random samples can't support universal claims. Ask how the sample was chosen." },
  { id: "f4", difficulty: "medium",
    prompt: "\u201cIf we let students redo one exam, soon they'll demand to redo every assignment, and eventually grades will mean nothing.\u201d",
    options: ["Slippery Slope", "False Dilemma", "Appeal to Emotion", "Ad Hominem"],
    correct: 0,
    explain: "This assumes one small policy change inevitably cascades into an extreme outcome, without showing why each step must follow.",
    tip: "Slippery slopes need each link in the chain justified. Missing links are the tell." },
  { id: "f5", difficulty: "medium",
    prompt: "\u201cMy opponent wants to regulate social media, which basically means they want the government to control everything we think.\u201d",
    options: ["Straw Man", "Appeal to Authority", "Circular Reasoning", "Hasty Generalization"],
    correct: 0,
    explain: "This exaggerates a specific regulatory proposal into an extreme, unrelated claim about mind control \u2014 easier to attack than the real position.",
    tip: "Compare the restated position to the original. If it's more extreme, it's likely a straw man." },
  { id: "f6", difficulty: "medium",
    prompt: "\u201cThis diet must work \u2014 a famous actor said it changed his life.\u201d",
    options: ["Appeal to Authority", "Slippery Slope", "Red Herring", "False Dilemma"],
    correct: 0,
    explain: "The actor has no relevant nutritional expertise; fame in an unrelated field doesn't validate a health claim.",
    tip: "Ask whether the 'authority' actually has expertise in the specific claim being made." },
  { id: "f7", difficulty: "hard",
    prompt: "\u201cWhy worry about the budget deficit? Let's talk about how the other party mishandled last year's storm response.\u201d",
    options: ["Red Herring", "Circular Reasoning", "Ad Hominem", "Appeal to Emotion"],
    correct: 0,
    explain: "This shifts attention to an unrelated topic (storm response) to avoid engaging with the deficit question.",
    tip: "If a response changes the subject rather than answering it, suspect a red herring." },
  { id: "f8", difficulty: "hard",
    prompt: "\u201cThe policy is right because it's just, and we know it's just because it's the right policy.\u201d",
    options: ["Circular Reasoning", "Straw Man", "Hasty Generalization", "Slippery Slope"],
    correct: 0,
    explain: "The conclusion ('it's right') is used as its own supporting evidence ('it's just'), so nothing is actually proven.",
    tip: "Trace the logic backward. If the conclusion loops back as its own premise, it's circular." },
  { id: "f9", difficulty: "hard",
    prompt: "\u201cThink of the children \u2014 anyone who opposes this curfew clearly doesn't care if kids get hurt.\u201d",
    options: ["Appeal to Emotion", "False Dilemma", "Ad Hominem", "Appeal to Authority"],
    correct: 0,
    explain: "This leans on fear and guilt about children's safety rather than presenting evidence the curfew actually reduces harm.",
    tip: "Emotional framing isn't automatically wrong, but watch when it replaces evidence rather than supporting it." }
];

const REBUTTAL_QUESTIONS = [
  { id: "r1", difficulty: "easy",
    prompt: "Weak argument: \u201cWe shouldn't recycle because some recycling plants use energy too.\u201d Pick the strongest counter.",
    options: [
      "Recycling plants use less energy overall than producing new materials from raw resources, so net energy use still drops.",
      "Recycling is a nice thing to do and makes people feel good.",
      "Everyone should recycle because it's the law in most places.",
      "The person who said this probably doesn't recycle themselves."
    ],
    correct: 0,
    explain: "This directly compares total energy costs, addressing the actual claim with a concrete mechanism instead of appealing to feelings or authority.",
    tip: "The strongest rebuttal engages the specific mechanism in the weak claim, not just its conclusion." },
  { id: "r2", difficulty: "easy",
    prompt: "Weak argument: \u201cRemote work can't be productive because you can't see your coworkers.\u201d Pick the strongest counter.",
    options: [
      "Multiple large-scale studies show output per hour is comparable or higher for many remote roles when tools support collaboration.",
      "Remote work is more comfortable, so it must be better.",
      "Offices are outdated and everyone knows it.",
      "The person saying this just doesn't like their coworkers."
    ],
    correct: 0,
    explain: "Citing measurable output data rebuts the productivity claim directly, rather than substituting comfort or opinion.",
    tip: "Look for the option that offers evidence tied to the specific claim (productivity), not a tangential benefit." },
  { id: "r3", difficulty: "medium",
    prompt: "Weak argument: \u201cRaising the minimum wage always causes mass unemployment.\u201d Pick the strongest counter.",
    options: [
      "Multiple regional studies comparing similar labor markets show employment effects are often small or statistically insignificant at moderate increases.",
      "Workers deserve more money no matter what happens to jobs.",
      "Any economist who disagrees is paid by big business.",
      "Minimum wage laws have existed for decades, so they must be fine."
    ],
    correct: 0,
    explain: "This challenges the 'always' claim with comparative empirical evidence, which is the actual weak point in the original statement.",
    tip: "When a claim uses an absolute word like 'always,' the sharpest rebuttal usually finds a documented exception." },
  { id: "r4", difficulty: "medium",
    prompt: "Weak argument: \u201cSocial media makes all teenagers depressed.\u201d Pick the strongest counter.",
    options: [
      "Research shows effects vary widely by usage pattern and content type, with passive scrolling linked to worse outcomes than active social use.",
      "Teenagers today are just more dramatic than before.",
      "My teenager uses social media and seems fine.",
      "Depression has always existed, so social media isn't the cause."
    ],
    correct: 0,
    explain: "This introduces the nuance the blanket claim ignores \u2014 that effects depend on how the platform is used, not just whether it's used.",
    tip: "A single personal anecdote is weaker evidence than a pattern shown across research; pick the option backed by broader data." },
  { id: "r5", difficulty: "hard",
    prompt: "Weak argument: \u201cAI will inevitably replace all human jobs, so there's no point training for a career.\u201d Pick the strongest counter.",
    options: [
      "Historically, automation has shifted the types of jobs available more than it has eliminated total employment, and new skill categories tend to emerge alongside new tools.",
      "AI is just hype and will fade away soon.",
      "Only people who don't understand technology say things like that.",
      "Jobs have always existed and always will, end of story."
    ],
    correct: 0,
    explain: "This responds with the actual historical pattern of technological shifts, addressing the inevitability claim with evidence rather than dismissal.",
    tip: "The best rebuttal to a sweeping prediction is usually a relevant historical pattern, not a flat denial." },
  { id: "r6", difficulty: "hard",
    prompt: "Weak argument: \u201cSince the ancient philosophers didn't need calculators, modern students shouldn't use them either.\u201d Pick the strongest counter.",
    options: [
      "Tools evolve alongside the problems people need to solve; the relevant question is whether calculators help students reach deeper mathematical understanding faster, not whether ancient thinkers had them.",
      "Ancient philosophers were smarter than us anyway.",
      "Calculators are required by most modern school curricula.",
      "That's a silly, outdated way of thinking."
    ],
    correct: 0,
    explain: "This exposes the actual logical gap \u2014 that historical absence of a tool says nothing about its present-day educational value.",
    tip: "When an argument leans on 'how things used to be,' the sharpest rebuttal asks whether that historical fact is actually relevant to today's goal." },
  { id: "r7", difficulty: "hard",
    prompt: "Weak argument: \u201cIf we allow one exception to the dress code, the whole policy becomes meaningless.\u201d Pick the strongest counter.",
    options: [
      "Well-defined exceptions with clear criteria (like medical or religious accommodations) can coexist with a policy's core purpose without undermining it, as seen in many existing institutional codes.",
      "Dress codes are old-fashioned and should be scrapped entirely.",
      "Rules are meant to be broken sometimes.",
      "The people who wrote the dress code don't even follow it."
    ],
    correct: 0,
    explain: "This directly challenges the slippery-slope assumption by pointing to real examples where bounded exceptions don't erode a policy's intent.",
    tip: "The strongest counter to a slippery-slope claim shows a real case where the predicted collapse didn't happen." }
];

const SPEED_QUESTIONS = [
  { id: "s1", difficulty: "easy", prompt: "\u201cAll swans are white\u201d is a valid universal claim as long as you've seen a few swans.", answer: false,
    explain: "A handful of observations can't establish a universal law \u2014 black swans exist and disprove the claim.",
    tip: "Universal claims need either exhaustive evidence or a logical guarantee, not just a sample." },
  { id: "s2", difficulty: "easy", prompt: "Correlation between two events is enough on its own to prove one causes the other.", answer: false,
    explain: "Correlation can result from coincidence or a shared underlying cause \u2014 causation needs more evidence.",
    tip: "Always ask: could a third factor explain both things happening together?" },
  { id: "s3", difficulty: "easy", prompt: "An argument can have true premises and still reach a false conclusion if the logic connecting them is flawed.", answer: true,
    explain: "Validity depends on the logical structure, not just the truth of the premises \u2014 bad structure can break a good argument.",
    tip: "Check the link between premises and conclusion separately from checking whether the premises are true." },
  { id: "s4", difficulty: "medium", prompt: "Attacking the messenger is a valid way to disprove their argument's content.", answer: false,
    explain: "The credibility of a speaker doesn't determine whether their claim is logically or factually correct.",
    tip: "Separate 'is this person trustworthy' from 'is this specific claim true' \u2014 they're different questions." },
  { id: "s5", difficulty: "medium", prompt: "A single well-documented counterexample can be enough to disprove an 'always' or 'never' claim.", answer: true,
    explain: "Absolute claims only need one solid counterexample to be logically disproven.",
    tip: "Absolute language is fragile \u2014 it invites you to search for just one exception." },
  { id: "s6", difficulty: "medium", prompt: "If an expert in one field endorses a claim in a completely different field, that endorsement carries strong evidential weight.", answer: false,
    explain: "Expertise doesn't transfer across unrelated domains, so the endorsement adds little genuine support.",
    tip: "Match the expert's actual specialty to the specific claim being made before weighing their opinion." },
  { id: "s7", difficulty: "hard", prompt: "Restating an opponent's position in its strongest possible form before rebutting it makes your own argument weaker.", answer: false,
    explain: "Steelmanning actually strengthens your position \u2014 defeating the strongest version of an argument is far more persuasive than defeating a weak one.",
    tip: "Audiences trust arguments more when they see you've engaged with the best version of the opposing view." },
  { id: "s8", difficulty: "hard", prompt: "A conclusion can be logically valid even if one of its premises turns out to be false.", answer: true,
    explain: "Validity is about the structure of the reasoning; an argument can be valid in form while still being unsound because a premise is false.",
    tip: "Validity (structure) and soundness (true premises + valid structure) are separate tests \u2014 don't conflate them." },
  { id: "s9", difficulty: "hard", prompt: "Bringing up an unrelated scandal to avoid answering a direct question is a legitimate debate tactic if it's entertaining.", answer: false,
    explain: "This is a textbook red herring \u2014 entertainment value doesn't make an evasive, off-topic pivot logically legitimate.",
    tip: "A tactic that avoids the question is a deflection, regardless of how engaging it is to an audience." }
];

const STEELMAN_QUESTIONS = [
  { id: "st1", difficulty: "easy",
    prompt: "You disagree: \u201cWe should ban homework in elementary school.\u201d Pick the option that best strengthens this position.",
    options: [
      "Research on younger children suggests structured, unsupervised playtime supports development at least as much as repetitive drills, so homework's marginal benefit may be small relative to its costs on family time and stress.",
      "Kids are lazy and don't want to do homework anyway.",
      "Teachers just assign homework to look busy.",
      "Homework should be banned because school is already too long."
    ],
    correct: 0,
    explain: "This grounds the opposing view in real developmental research and a genuine cost-benefit tradeoff, rather than dismissive or unsupported claims.",
    tip: "A true steelman adds the best available evidence for the other side, even points they didn't think to raise themselves." },
  { id: "st2", difficulty: "easy",
    prompt: "You disagree: \u201cCash should be phased out in favor of fully digital payments.\u201d Pick the strongest version of this position.",
    options: [
      "Digital payments create auditable trails that can reduce tax evasion and certain types of crime, and modern systems increasingly support offline verification to address access concerns.",
      "Cash is just old and inconvenient.",
      "Nobody uses cash anymore anyway, so it doesn't matter.",
      "Banks want to get rid of cash to make more money."
    ],
    correct: 0,
    explain: "This presents concrete civic benefits and preemptively addresses the strongest counterpoint (access), rather than relying on vague dismissiveness or cynicism.",
    tip: "Look for the option that anticipates and answers the obvious objection \u2014 that's a mark of genuine steelmanning." },
  { id: "st3", difficulty: "medium",
    prompt: "You disagree: \u201cCollege degrees should not be required for most jobs.\u201d Pick the strongest version of this position.",
    options: [
      "Many roles can be validated through portfolios, certifications, or apprenticeships that measure actual skill more directly and affordably than a multi-year degree, especially in rapidly changing technical fields.",
      "College is a scam designed to take your money.",
      "Nobody actually learns anything useful in college.",
      "Smart people don't need college to succeed."
    ],
    correct: 0,
    explain: "This identifies specific, credible alternatives to degrees and ties the argument to real tradeoffs (cost, relevance, speed) instead of blanket cynicism.",
    tip: "The strongest steelman names concrete alternatives, not just criticism of the current system." },
  { id: "st4", difficulty: "medium",
    prompt: "You disagree: \u201cCities should remove most street parking to add bike lanes.\u201d Pick the strongest version of this position.",
    options: [
      "Data from cities that made this shift shows increased foot traffic and local business revenue along converted corridors, alongside reduced congestion, though the transition requires careful phasing for affected businesses.",
      "Cars are bad for the planet and drivers should feel guilty.",
      "Everyone should just bike everywhere, it's not hard.",
      "Parking is a waste of space, full stop."
    ],
    correct: 0,
    explain: "This cites measurable outcomes from real transitions and honestly acknowledges the transition cost, which is what a genuinely strong version of this argument would do.",
    tip: "A steelman that ignores real downsides isn't actually the strongest version \u2014 acknowledging tradeoffs makes it more credible, not less." },
  { id: "st5", difficulty: "hard",
    prompt: "You disagree: \u201cStandardized testing should be eliminated from college admissions.\u201d Pick the strongest version of this position.",
    options: [
      "Some studies suggest standardized scores correlate with socioeconomic access to test prep more strongly than with college readiness, so removing them may reduce one systemic bias, provided admissions offices find comparably rigorous holistic measures.",
      "Tests are just numbers and don't measure anything real.",
      "Rich kids do better on tests, so tests are useless.",
      "Nobody likes taking tests, so we should get rid of them."
    ],
    correct: 0,
    explain: "This engages with the actual empirical concern (correlation with access rather than readiness) and honestly flags the condition needed for the policy to work well.",
    tip: "The best steelman states the precise mechanism of the concern (access vs. readiness) rather than a vague complaint." },
  { id: "st6", difficulty: "hard",
    prompt: "You disagree: \u201cCompanies should be required to offer a 4-day work week.\u201d Pick the strongest version of this position.",
    options: [
      "Several controlled trials across multiple industries found productivity per hour rose enough to offset the lost day in many roles, suggesting the mandate could work broadly if paired with flexibility for roles where it genuinely doesn't fit.",
      "People are tired of working and deserve more rest, obviously.",
      "Four-day weeks are trendy and every company should just do it.",
      "Working five days is outdated and needs to end now."
    ],
    correct: 0,
    explain: "This grounds the case in trial data and honestly notes the need for role-based flexibility, which is what a serious version of this argument would include.",
    tip: "Genuine steelmanning includes the caveats a thoughtful advocate would add, not just the headline claim." },
  { id: "st7", difficulty: "hard",
    prompt: "You disagree: \u201cSocial media platforms should be legally required to verify user identities.\u201d Pick the strongest version of this position.",
    options: [
      "Verified-identity systems have measurably reduced coordinated harassment and bot-driven misinformation in trial regions, though the strongest version of this policy would need robust safeguards to protect vulnerable users who rely on anonymity for safety.",
      "Anonymous people online are always trolls.",
      "If you have nothing to hide, you shouldn't mind showing your identity.",
      "The internet was better before social media existed anyway."
    ],
    correct: 0,
    explain: "This cites a real observed effect and, crucially, names the strongest counterargument (protecting vulnerable anonymous users) that a serious advocate would need to address.",
    tip: "A true steelman doesn't just support a side \u2014 it shows awareness of the position's own hardest internal tension." }
];

const MODE_META = {
  fallacy: {
    name: "Fallacy Practice", key: "fallacy",
    desc: "Spot the logical fallacy hiding in each argument.",
    icon: iconFallacy(), color: "cyan", xp: 120, skill: "logic",
    data: FALLACY_QUESTIONS, type: "mc"
  },
  rebuttal: {
    name: "Rebuttal Practice", key: "rebuttal",
    desc: "Given a weak argument, choose the strongest counter.",
    icon: iconRebuttal(), color: "violet", xp: 140, skill: "strategy",
    data: REBUTTAL_QUESTIONS, type: "mc"
  },
  speed: {
    name: "Quick Drills", key: "speed",
    desc: "Rapid-fire true/false calls on argument validity. 5s per question.",
    icon: iconSpeed(), color: "magenta", xp: 100, skill: "speed",
    data: SPEED_QUESTIONS, type: "tf", timed: true
  },
  steelman: {
    name: "Steelman Challenge", key: "steelman",
    desc: "Strengthen the case you disagree with \u2014 the mark of a true debater.",
    icon: iconSteelman(), color: "green", xp: 160, skill: "rhetoric",
    data: STEELMAN_QUESTIONS, type: "mc"
  }
};

function iconFallacy() {
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 21H22L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 9V13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>';
}
function iconRebuttal() {
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M8 10H4a1 1 0 00-1 1v4a1 1 0 001 1h4l5 4V6l-5 4z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M17 9a4 4 0 010 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
}
function iconSpeed() {
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M13 2L4 14H12L11 22L20 10H12L13 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
}
function iconSteelman() {
  return '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 3L4 6.5V11C4 15.5 7.4 19.7 12 21C16.6 19.7 20 15.5 20 11V6.5L12 3Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9 12L11 14L15 9.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

const RANKS = [
  { name: "Novice Debater", min: 0 },
  { name: "Rising Arguer", min: 300 },
  { name: "Skilled Rhetorician", min: 800 },
  { name: "Logic Tactician", min: 1600 },
  { name: "Master Orator", min: 2800 },
  { name: "Grandmaster of Rhetoric", min: 4500 }
];
// Applies the rank-tier-N class (0-5, low-to-high, see the RANK TIERS block
// in styles.css) to a rank display element and strips any previous tier
// class off it first, since these elements get re-rendered in place.
function paintRankTier(el, rank) {
  if (!el) return;
  const idx = RANKS.indexOf(rank);
  // classList, not el.className string manipulation: .rank-seal is an <svg>,
  // whose .className is an SVGAnimatedString (no .replace()), not a plain
  // string like an HTMLElement's — className.replace() threw there and
  // silently aborted the rest of renderProfile.
  for (let i = 0; i < RANKS.length; i++) el.classList.remove("rank-tier-" + i);
  if (idx >= 0) el.classList.add("rank-tier-" + idx);
}

const BADGES = [
  { id: "first_win", name: "First Debate", icon: "\u2713", cond: s => s.totalRuns >= 1 },
  { id: "streak3", name: "3-Day Streak", icon: "\uD83D\uDD25", cond: s => s.streak >= 3 },
  { id: "streak7", name: "7-Day Streak", icon: "\u2B50", cond: s => s.streak >= 7 },
  { id: "fallacy_master", name: "Fallacy Master", icon: "\u26A1", cond: s => (s.modeStats.fallacy?.bestPct || 0) >= 90 },
  { id: "steelman_pro", name: "Steelman Pro", icon: "\uD83D\uDEE1", cond: s => (s.modeStats.steelman?.bestPct || 0) >= 80 },
  { id: "speed_demon", name: "Quick Thinker", icon: "\u23F1", cond: s => (s.modeStats.speed?.bestPct || 0) >= 90 },
  { id: "xp1000", name: "1K Club", icon: "\uD83D\uDCAF", cond: s => s.totalXp >= 1000 },
  { id: "all_modes", name: "Well Rounded", icon: "\uD83C\uDFAF", cond: s => Object.keys(s.modeStats).length >= 4 }
];

/* ---------------------------------------------------------
   1. STATE + PERSISTENCE
   --------------------------------------------------------- */

const STORAGE_KEY = "veritas_save_v1";

function defaultState() {
  return {
    totalXp: 0,
    streak: 0,
    lastPlayDate: null,
    totalRuns: 0,
    skills: { logic: 0, speed: 0, rhetoric: 0, analysis: 0, strategy: 0 },
    modeStats: {},        // { fallacy: { bestScore, bestPct, plays } }
    dailyCompletedDate: null,
    activity: {},          // { "YYYY-MM-DD": count }
    quests: null,          // { date, prog, done, modes } - see arcade.js
    achievements: [],      // unlocked achievement ids
    bestCombo: 0           // longest all-time answer chain
  };
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return Object.assign(defaultState(), parsed);
  } catch (e) {
    return defaultState();
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) { /* storage unavailable, ignore */ }
  // Mirror progress to Supabase in the background (best-effort).
  // pushProfileToServer is defined later in section 17; guard in case
  // saveState is called before that section has executed (e.g. during
  // module initialisation).
  if (typeof pushProfileToServer === "function") {
    pushProfileToServer();
  }
}

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function registerPlayToday() {
  const today = todayStr();
  if (state.lastPlayDate === today) {
    // same day, keep streak
  } else if (state.lastPlayDate === todayStr(-1)) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }
  state.lastPlayDate = today;
  state.activity[today] = (state.activity[today] || 0) + 1;
}

function rankForXp(xp) {
  let currentRank = RANKS[0];
  for (const r of RANKS) if (xp >= r.min) currentRank = r;
  const idx = RANKS.indexOf(currentRank);
  const next = RANKS[idx + 1] || null;
  return { current: currentRank, next };
}

/* ---------------------------------------------------------
   2. NAVIGATION
   --------------------------------------------------------- */

const screens = {};
document.querySelectorAll(".screen").forEach(s => { screens[s.dataset.screen] = s; });
let activeScreen = null;

function showScreen(name) {
  const next = screens[name];
  if (!next) return;
  if (name === activeScreen) return; // already here — preserve the current view
  const prev = activeScreen ? screens[activeScreen] : null;

  if (prev && prev !== next) {
    if (prev._exitTimer) window.clearTimeout(prev._exitTimer);
    prev.classList.remove("enter");
    prev.classList.add("exit");
    prev._exitTimer = window.setTimeout(() => {
      if (screens[activeScreen] !== prev) {
        prev.classList.remove("active", "exit");
      }
      prev._exitTimer = null;
    }, 150); // matches .screen.exit's 0.12s animation (+ small buffer), not an arbitrary value
  }

  if (next._exitTimer) {
    window.clearTimeout(next._exitTimer);
    next._exitTimer = null;
  }
  next.classList.add("active");
  next.classList.remove("exit", "enter");
  void next.offsetWidth;
  next.classList.add("enter");

  activeScreen = name;
  document.querySelectorAll(".sidebar-link, .topbar-actions [data-nav]").forEach(el => {
    el.classList.toggle("active", el.dataset.nav === name);
  });
  onScreenShown(name);
}

document.querySelectorAll("[data-nav]").forEach(el => {
  el.addEventListener("click", () => {
    playClick();
    showScreen(el.dataset.nav);
  });
});

function onScreenShown(name) {
  if (name === "home") renderHome();
  if (name === "profile") {
    renderProfile();
    if (window.avatarRenderProfile) window.avatarRenderProfile();
  }
  if (name === "leaderboard") renderLeaderboard();
  if (name === "daily") renderDailyDetail();
  if (name === "classroom" && window.classroomOpen) window.classroomOpen();
  if (name === "multiplayer") {
    if (window.mpOpenLobby) {
      window.mpOpenLobby();
    }
  }
}

/* ---------------------------------------------------------
   3. AUDIO (Web Audio API — subtle blips)
   --------------------------------------------------------- */

let audioCtx = null;
function getCtx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { audioCtx = null; }
  }
  return audioCtx;
}

function blip(freq, duration, type = "sine", vol = 0.06) {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  gain.gain.setValueAtTime(vol, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function playClick() { blip(680, 0.06, "sine", 0.03); }
function playCorrect() {
  blip(660, 0.12, "sine", 0.05);
  window.setTimeout(() => blip(880, 0.16, "sine", 0.05), 90);
}
function playIncorrect() { blip(180, 0.22, "sawtooth", 0.045); }
function playTick() { blip(1000, 0.04, "square", 0.02); }
function playLevelUp() {
  [520, 660, 780, 990].forEach((f, i) => window.setTimeout(() => blip(f, 0.18, "sine", 0.05), i * 90));
}

/* ---------------------------------------------------------
   4. TOASTS
   --------------------------------------------------------- */

function toast(msg) {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  root.appendChild(el);
  window.setTimeout(() => el.remove(), 2800);
}

/* ---------------------------------------------------------
   5. CONSTELLATION PARTICLE BACKGROUND (canvas)
   --------------------------------------------------------- */

(function particleEngine() {
  const canvas = document.getElementById("bg-canvas");
  // The constellation effect was retired visually (see styles.css,
  // #bg-canvas { display: none }) but this loop used to keep running
  // anyway, computing pairwise particle distances every frame for a
  // canvas nobody can see. Bail out immediately if it's hidden so we
  // don't burn CPU/battery on invisible work.
  if (!canvas || getComputedStyle(canvas).display === "none") return;
  const ctx = canvas.getContext("2d");
  let w, h, particles = [];
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.min(70, Math.floor((w * h) / 18000));
    particles = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.6 + 0.6
    }));
  }

  function step() {
    ctx.clearRect(0, 0, w, h);
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
    }
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const a = particles[i], b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 130) {
          ctx.strokeStyle = `rgba(0,229,255,${0.12 * (1 - dist / 130)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of particles) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(180,230,255,0.55)";
      ctx.fill();
    }
    if (!reduced) requestAnimationFrame(step);
  }

  window.addEventListener("resize", resize);
  resize();
  if (reduced) { step(); } else { requestAnimationFrame(step); }
})();

/* ---------------------------------------------------------
   6. RADAR CHART (canvas)
   --------------------------------------------------------- */

const SKILL_LABELS = ["Logic", "Speed", "Rhetoric", "Analysis", "Strategy"];
const SKILL_KEYS = ["logic", "speed", "rhetoric", "analysis", "strategy"];

function drawRadar(canvasEl, values, opts = {}) {
  const ctx = canvasEl.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const parent = canvasEl.parentElement;
  const available = (parent && parent.clientWidth) ? parent.clientWidth - 8 : canvasEl.clientWidth || 280;
  const size = Math.max(180, Math.min(320, Math.round(available)));
  canvasEl.style.width = size + "px";
  canvasEl.style.height = size + "px";
  canvasEl.width = size * dpr;
  canvasEl.height = size * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const cx = size / 2, cy = size / 2;
  const radius = size * 0.34;
  const n = values.length;
  const maxVal = 100;

  ctx.clearRect(0, 0, size, size);

  const rings = 4;
  for (let ring = 1; ring <= rings; ring++) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
      const r = (radius * ring) / rings;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.font = "11px 'JetBrains Mono', monospace";
  ctx.fillStyle = "rgba(154,161,184,0.9)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x2 = cx + Math.cos(angle) * radius;
    const y2 = cy + Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.stroke();

    const lx = cx + Math.cos(angle) * (radius + 22);
    const ly = cy + Math.sin(angle) * (radius + 22);
    ctx.fillText(SKILL_LABELS[i], lx, ly);
  }

  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const val = Math.max(0, Math.min(maxVal, values[idx])) / maxVal;
    const r = radius * val;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, "rgba(0,229,255,0.35)");
  grad.addColorStop(1, "rgba(255,45,123,0.25)");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2;
  ctx.stroke();

  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const val = Math.max(0, Math.min(maxVal, values[i])) / maxVal;
    const r = radius * val;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
}

/* ---------------------------------------------------------
   7. NUMBER TICK-UP ANIMATION
   --------------------------------------------------------- */

function tickUp(el, from, to, duration = 900) {
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(from + (to - from) * eased);
    el.textContent = val.toLocaleString();
    if (t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------------------------------------------------------
   8. HOME RENDER
   --------------------------------------------------------- */

function renderHome() {
  const { current: currentRank, next } = rankForXp(state.totalXp);

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  document.getElementById("home-greeting-time").textContent = timeGreeting;
  document.getElementById("home-greeting-name").textContent = cachedProfile.displayName || "Debater";

  Arcade.quests.render(document.getElementById("arcade-quests"), state, todayStr());
  const homeRankEl = document.getElementById("home-rank");
  homeRankEl.textContent = currentRank.name;
  paintRankTier(homeRankEl, currentRank);
  document.getElementById("sidebar-xp-mini").textContent = state.totalXp.toLocaleString() + " XP";
  const xpEl = document.getElementById("home-xp-value");
  tickUp(xpEl, 0, state.totalXp, 700);
  const pct = next ? Math.min(100, ((state.totalXp - currentRank.min) / (next.min - currentRank.min)) * 100) : 100;
  document.getElementById("home-xp-fill").style.width = pct + "%";
  document.getElementById("home-xp-next").textContent = next
    ? `${next.min - state.totalXp} XP to ${next.name}`
    : "Max rank reached";
  document.getElementById("home-streak").textContent = state.streak;

  document.getElementById("home-stat-debates").textContent = state.totalRuns.toLocaleString();
  document.getElementById("home-stat-streak").textContent = state.streak;

  // ELO + win-rate from server profile (may still be null on first load)
  const ratingEl = document.getElementById("home-stat-rating");
  const winrateEl = document.getElementById("home-stat-winrate");
  if (ratingEl) {
    ratingEl.textContent = cachedProfile.eloRating !== null
      ? cachedProfile.eloRating.toLocaleString()
      : "—";
  }
  if (winrateEl) {
    const { wins, losses, ties } = cachedProfile;
    const total = (wins || 0) + (losses || 0) + (ties || 0);
    winrateEl.classList.remove("positive", "negative");
    if (total > 0) {
      const pct = Math.round(((wins || 0) / total) * 100);
      winrateEl.textContent = pct + "%";
      winrateEl.classList.add(pct >= 50 ? "positive" : "negative");
    } else {
      winrateEl.textContent = "—";
    }
  }

  const grid = document.getElementById("home-mode-grid");
  grid.innerHTML = "";
  Object.values(MODE_META).forEach(mode => {
    const card = document.createElement("button");
    card.className = "mode-card";
    card.dataset.mode = mode.key;
    const stats = state.modeStats[mode.key];
    card.innerHTML = `
      <div class="mode-card-icon">${mode.icon}</div>
      <div class="mode-card-body">
        <h3>${mode.name}</h3>
        <p>${mode.desc}</p>
      </div>
      ${stats ? `<span class="mode-card-tag">BEST ${stats.bestPct}%</span>` : `<span class="mode-card-tag">NEW</span>`}
    `;
    card.addEventListener("click", () => {
      playClick();
      openModeSelect(mode.key);
    });
    grid.appendChild(card);
  });

  updateDailyCountdownAll();
  renderRecentActivity();
}

function formatActivityDate(dateStr) {
  if (dateStr === todayStr()) return "Today";
  if (dateStr === todayStr(-1)) return "Yesterday";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function renderRecentActivity() {
  const list = document.getElementById("home-activity-list");
  if (!list) return;
  const days = Object.keys(state.activity)
    .filter(day => state.activity[day] > 0)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, 5);

  if (!days.length) {
    list.innerHTML = `
      <div class="activity-empty">
        <svg class="activity-empty-art" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
          <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M16 22c14-8 28-8 42 0v40c-14-8-28-8-42 0z"/>
            <path d="M58 22c14-8 28-8 42 0v40c-14-8-28-8-42 0z"/>
            <path d="M58 22v40"/>
          </g>
          <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" opacity="0.6">
            <path d="M28 38h18M28 48h12M72 38h18M72 48h12"/>
          </g>
        </svg>
        <p>Nothing on the record yet.</p>
        <span>Finish a practice run or a debate and it will show up here.</span>
      </div>`;
    return;
  }

  list.innerHTML = days.map(day => {
    const count = state.activity[day];
    return `
      <div class="activity-row">
        <span class="activity-row-date">${formatActivityDate(day)}</span>
        <span class="activity-row-desc">${count} run${count === 1 ? "" : "s"} completed</span>
      </div>
    `;
  }).join("");
}

/* ---------------------------------------------------------
   9. MODE SELECT
   --------------------------------------------------------- */

let modeKey = null;
let modeDifficulty = "all";

function openModeSelect(selectedKey) {
  const mode = MODE_META[selectedKey];
  if (!mode) {
    window.DA.toast("That mode isn't available right now.");
    return;
  }
  modeKey = selectedKey;
  modeDifficulty = "all";
  document.getElementById("mode-select-title").textContent = mode.name;
  document.getElementById("mode-detail-icon").innerHTML = mode.icon;
  document.getElementById("mode-detail-name").textContent = mode.name;
  document.getElementById("mode-detail-desc").textContent = mode.desc;
  document.getElementById("mode-xp-reward").textContent = "+" + mode.xp;

  const stats = state.modeStats[modeKey];
  document.getElementById("mode-best-score").textContent = stats ? stats.bestPct + "%" : "--";
  document.getElementById("mode-plays").textContent = stats ? stats.plays : 0;

  const diffs = ["all", "easy", "medium", "hard"];
  const row = document.getElementById("difficulty-row");
  row.innerHTML = "";
  diffs.forEach(d => {
    const label = d === "all" ? "All" : d[0].toUpperCase() + d.slice(1);
    const btn = document.createElement("button");
    btn.className = "diff-pill" + (d === "all" ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      playClick();
      modeDifficulty = d;
      row.querySelectorAll(".diff-pill").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
    });
    row.appendChild(btn);
  });

  showScreen("mode-select");
}

document.getElementById("mode-start-btn").addEventListener("click", () => {
  playClick();
  if (!modeKey) {
    window.DA.toast("Choose a mode before starting.");
    return;
  }
  startGame(modeKey, modeDifficulty);
});

/* ---------------------------------------------------------
   10. GAME ENGINE
   --------------------------------------------------------- */

let gameCtx = null;
// Counts plays per mode+difficulty within THIS session (resets on page
// reload). Folded into the shuffle seed so every Start/Retry click gets
// a different question set, while still rotating by date underneath.
const playAttemptCounts = {};

function startGame(modeKey, difficulty) {
  const mode = MODE_META[modeKey];
  let pool = mode.data.slice();
  if (difficulty !== "all") pool = pool.filter(q => q.difficulty === difficulty);
  if (pool.length === 0) pool = mode.data.slice();
  // Seeded by today's date + mode + difficulty + attempt number, so each
  // play (including Retry) gets a fresh shuffle, and the overall pool
  // composition still shifts day-to-day.
  const attemptKey = `${modeKey}-${difficulty}`;
  const attempt = (playAttemptCounts[attemptKey] = (playAttemptCounts[attemptKey] || 0) + 1);
  pool = seededShuffle(pool, `${todayStr()}-${modeKey}-${difficulty}-${attempt}`);
  pool = pool.slice(0, Math.min(8, pool.length));

  gameCtx = {
    modeKey, mode, questions: pool,
    index: 0, correctCount: 0,
    streakCur: 0, streakBest: 0,
    score: 0,
    isDaily: false, xpMultiplier: 1
  };

  Arcade.combo.reset();
  document.getElementById("game-mode-label").textContent = mode.name;
  showScreen("game");
  renderQuestion();
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* ---------------------------------------------------------
   9b. DATE-SEEDED SHUFFLE
   Deterministic "random" ordering derived from a seed string
   (e.g. today's date + mode key). Same seed always produces
   the same order, so a given mode shows the same question set
   all day, and a different set the next day, without ever
   touching localStorage or the network.
   --------------------------------------------------------- */
function seededRandomFn(seedStr) {
  // xmur3 hash -> 32-bit seed
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let seed = h >>> 0;
  // mulberry32 PRNG
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(arr, seedStr) {
  const rand = seededRandomFn(seedStr);
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function renderQuestion() {
  const { questions, index, mode } = gameCtx;
  const q = questions[index];
  const pct = (index / questions.length) * 100;
  document.getElementById("game-progress-fill").style.width = pct + "%";
  document.getElementById("score-float-value").textContent = gameCtx.score;

  const tagEl = document.getElementById("q-difficulty");
  tagEl.textContent = q.difficulty.toUpperCase();
  tagEl.className = "q-tag" + (q.difficulty === "medium" ? " med" : q.difficulty === "hard" ? " hard" : "");
  document.getElementById("q-text").textContent = q.prompt;

  const optionsGrid = document.getElementById("options-grid");
  optionsGrid.innerHTML = "";

  if (mode.type === "tf") {
    optionsGrid.classList.add("tf-grid");
    ["True", "False"].forEach((label, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.innerHTML = `<span>${label}</span>`;
      btn.addEventListener("click", () => selectAnswer(i === 0));
      optionsGrid.appendChild(btn);
    });
  } else {
    optionsGrid.classList.remove("tf-grid");
    const letters = ["A", "B", "C", "D"];
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option-btn";
      btn.innerHTML = `<span class="option-letter">${letters[i]}</span><span>${opt}</span>`;
      btn.addEventListener("click", () => selectAnswer(i));
      optionsGrid.appendChild(btn);
    });
  }

  const timerWrap = document.getElementById("game-timer");
  if (mode.timed) {
    timerWrap.style.visibility = "visible";
    startTimer(5);
  } else {
    timerWrap.style.visibility = "hidden";
  }
}

let timerInterval = null;
function startTimer(seconds) {
  clearInterval(timerInterval);
  let t = seconds;
  const valueEl = document.getElementById("game-timer-value");
  const wrap = document.getElementById("game-timer");
  wrap.classList.remove("urgent");
  valueEl.textContent = t;
  timerInterval = setInterval(() => {
    t -= 1;
    valueEl.textContent = Math.max(0, t);
    if (t <= 2) { wrap.classList.add("urgent"); playTick(); }
    if (t <= 0) {
      clearInterval(timerInterval);
      selectAnswer(null, true);
    }
  }, 1000);
}

function selectAnswer(answer, timedOut = false) {
  clearInterval(timerInterval);
  const { questions, index, mode } = gameCtx;
  const q = questions[index];
  const buttons = Array.from(document.querySelectorAll("#options-grid .option-btn"));
  buttons.forEach(b => (b.disabled = true));

  let isCorrect = false;
  let correctIdx = null;

  if (mode.type === "tf") {
    isCorrect = !timedOut && answer === q.answer;
    correctIdx = q.answer ? 0 : 1;
  } else {
    isCorrect = !timedOut && answer === q.correct;
    correctIdx = q.correct;
  }

  buttons.forEach((b, i) => {
    if (i === correctIdx) b.classList.add("correct");
    else if (!timedOut && i === answer) b.classList.add("incorrect");
    else b.classList.add("dim");
  });

  if (isCorrect) {
    gameCtx.correctCount += 1;
    gameCtx.streakCur += 1;
    gameCtx.streakBest = Math.max(gameCtx.streakBest, gameCtx.streakCur);
    const base = q.difficulty === "hard" ? 30 : q.difficulty === "medium" ? 20 : 12;
    // The combo multiplier replaces the old flat streak bonus: it scales
    // faster and, unlike the old bonus, it is visible while you play.
    const mult = Arcade.combo.hit();
    const gained = Math.round(base * mult);
    gameCtx.score += gained;
    Arcade.pop(buttons[correctIdx], "+" + gained, mult >= 2 ? "big" : "");
    playCorrect();
  } else {
    gameCtx.streakCur = 0;
    Arcade.combo.miss();
    Arcade.shake(document.getElementById("question-card"));
    playIncorrect();
  }
  document.getElementById("score-float-value").textContent = gameCtx.score;

  showFeedback(isCorrect, q, timedOut);
}

function showFeedback(isCorrect, q, timedOut) {
  const overlay = document.getElementById("feedback-overlay");
  const icon = document.getElementById("feedback-icon");
  const title = document.getElementById("feedback-title");
  const explain = document.getElementById("feedback-explain");
  const tip = document.getElementById("coach-tip-text");

  icon.className = "feedback-icon " + (isCorrect ? "correct" : "incorrect");
  icon.innerHTML = isCorrect
    ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 12L9 17L20 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6L18 18M6 18L18 6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>';
  title.textContent = timedOut ? "Time's up!" : (isCorrect ? "Correct!" : "Not quite");
  explain.textContent = q.explain;
  tip.textContent = q.tip;

  overlay.classList.add("active");
  // Keep the run moving. Any touch, click or keypress on the panel
  // cancels this, so reading an explanation is never interrupted.
  Arcade.autoAdvance(
    document.getElementById("feedback-next-btn"),
    document.getElementById("feedback-panel"),
    isCorrect ? 3200 : 6000
  );
}

document.getElementById("feedback-next-btn").addEventListener("click", () => {
  Arcade.cancelAdvance();
  playClick();
  document.getElementById("feedback-overlay").classList.remove("active");
  gameCtx.index += 1;
  if (gameCtx.index >= gameCtx.questions.length) {
    finishGame();
  } else {
    renderQuestion();
  }
});

document.getElementById("game-exit-btn").addEventListener("click", () => {
  clearInterval(timerInterval);
  document.getElementById("feedback-overlay").classList.remove("active");
  playClick();
  showScreen("home");
});

function finishGame() {
  const { questions, correctCount, streakBest, mode, isDaily, xpMultiplier } = gameCtx;
  const total = questions.length;
  const accuracy = Math.round((correctCount / total) * 100);

  registerPlayToday();
  state.totalRuns += 1;

  const prevStats = state.modeStats[gameCtx.modeKey] || { bestPct: 0, plays: 0, bestScore: 0 };
  const newStats = {
    bestPct: Math.max(prevStats.bestPct, accuracy),
    plays: prevStats.plays + 1,
    bestScore: Math.max(prevStats.bestScore, gameCtx.score)
  };
  state.modeStats[gameCtx.modeKey] = newStats;

  // skill bump
  const skillGain = Math.round((accuracy / 100) * 8) + 2;
  state.skills[mode.skill] = Math.min(100, (state.skills[mode.skill] || 0) + skillGain);

  const baseXp = Math.round(mode.xp * (correctCount / total));
  const accuracyBonus = accuracy >= 80 ? Math.round(mode.xp * 0.25) : accuracy >= 50 ? Math.round(mode.xp * 0.1) : 0;
  const streakBonus = streakBest >= 4 ? 30 : streakBest >= 2 ? 12 : 0;
  let totalXpGain = baseXp + accuracyBonus + streakBonus;
  // Daily challenge multiplies the entire earned XP total, including base, accuracy, and streak bonuses.
  if (isDaily) totalXpGain *= (xpMultiplier || 1);
  totalXpGain = Math.round(totalXpGain);

  const prevRank = rankForXp(state.totalXp).current;
  state.totalXp += totalXpGain;

  // Run report drives the daily goals and the achievement checks.
  state.bestCombo = Math.max(state.bestCombo || 0, Arcade.combo.best);
  const run = {
    correct: correctCount, accuracy: accuracy, score: gameCtx.score,
    bestCombo: Arcade.combo.best, modeKey: gameCtx.modeKey, isDaily: isDaily
  };
  const questsDone = Arcade.quests.report(state, todayStr(), run);
  const unlocked = Arcade.achievements.check(state, run);
  saveState();

  if (accuracy === 100) Arcade.confetti();
  Arcade.celebrate(
    questsDone.map(q => "Goal cleared: " + q.text + "  +" + q.xp + " XP")
      .concat(unlocked.map(a => "Achievement: " + a.name))
  );

  const newRank = rankForXp(state.totalXp).current;
  if (newRank.name !== prevRank.name) {
    window.setTimeout(() => { playLevelUp(); toast("Rank up: " + newRank.name + "!"); }, 500);
  }

  renderSummary({ correctCount, total, accuracy, streakBest, mode, baseXp, accuracyBonus, streakBonus, totalXpGain });
  showScreen("summary");
}

/* ---------------------------------------------------------
   11. SUMMARY
   --------------------------------------------------------- */

function renderSummary(data) {
  const { correctCount, total, accuracy, streakBest, mode, baseXp, accuracyBonus, streakBonus, totalXpGain } = data;

  document.getElementById("summary-eyebrow").textContent = accuracy >= 80 ? "Excellent Run" : accuracy >= 50 ? "Run Complete" : "Keep Practicing";
  document.getElementById("summary-mode-name").textContent = mode.name;
  document.getElementById("summary-correct").textContent = `${correctCount}/${total}`;
  document.getElementById("summary-accuracy").textContent = `${accuracy}%`;
  document.getElementById("summary-streak-best").textContent = streakBest;

  document.getElementById("xp-line-base").querySelector("span:last-child").textContent = "+" + baseXp;
  document.getElementById("xp-line-accuracy").querySelector("span:last-child").textContent = "+" + accuracyBonus;
  document.getElementById("xp-line-streak").querySelector("span:last-child").textContent = "+" + streakBonus;
  document.getElementById("xp-line-total").querySelector("span:last-child").textContent = "+" + totalXpGain;

  const values = SKILL_KEYS.map(k => state.skills[k] || 0);
  drawRadar(document.getElementById("radar-canvas"), values);
}

document.getElementById("summary-retry-btn").addEventListener("click", () => {
  playClick();
  if (!modeKey) {
    window.DA.toast("No mode selected for retry.");
    return;
  }
  startGame(modeKey, modeDifficulty);
});
document.getElementById("summary-home-btn").addEventListener("click", () => {
  playClick();
  showScreen("home");
});

/* ---------------------------------------------------------
   12. PROFILE
   --------------------------------------------------------- */

function renderProfileWeek() {
  const chart = document.getElementById("profile-week-chart");
  if (!chart) return;
  const days = Array.from({length: 14}, (_, i) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (13 - i));
    return { date, count: Math.max(0, Number(state.activity[date.toISOString().slice(0, 10)]) || 0) };
  });
  const recent = days.slice(7);
  const total = recent.reduce((sum, day) => sum + day.count, 0);
  const previous = days.slice(0, 7).reduce((sum, day) => sum + day.count, 0);
  const peak = Math.max(1, ...recent.map(day => day.count));
  chart.innerHTML = recent.map(({date, count}) => `<div class="profile-day"><span>${count}</span><div class="profile-day-track"><div style="height:${count / peak * 100}%"></div></div><span>${date.toLocaleDateString(undefined, {weekday:'short', timeZone:'UTC'})}</span></div>`).join('');
  document.getElementById("profile-week-summary").textContent = total ? `${total} activities · ${recent.filter(day => day.count > 0).length} active days · ${total === previous ? 'same as' : Math.abs(total - previous) + (total > previous ? ' more than' : ' fewer than')} the previous seven days.` : 'Your next completed activity starts this week’s chart.';
}

function renderProfile() {
  renderProfileWeek();
  const nameEl = document.getElementById("profile-display-name");
  if (nameEl) nameEl.textContent = cachedProfile.displayName || "Debater";

  const { current } = rankForXp(state.totalXp);
  const profileRankEl = document.getElementById("profile-rank");
  profileRankEl.textContent = current.name;
  paintRankTier(profileRankEl, current);
  document.getElementById("profile-xp-sub").textContent = state.totalXp.toLocaleString() + " total XP";

  // Populate ELO from the cached server profile (updated async in background)
  const eloEl = document.getElementById("profile-elo-sub");
  if (eloEl) {
    if (cachedProfile.eloRating !== null) {
      const wl = cachedProfile.wins !== null
        ? ` · ${cachedProfile.wins}W ${cachedProfile.losses}L ${cachedProfile.ties}T`
        : "";
      eloEl.textContent = `Debate ELO: ${cachedProfile.eloRating}${wl}`;
    } else {
      eloEl.textContent = "Debate ELO: — (play a multiplayer match to earn one)";
    }
  }

  /* --- Avatar monogram fallback -------------------------------------
     Shown when no uploaded avatar exists. Derived from the display name so
     an empty profile still reads as somebody's rather than a grey glyph. */
  const monogram = document.getElementById("profile-avatar-monogram");
  if (monogram) {
    const dn = (cachedProfile.displayName || "Debater").trim();
    monogram.textContent = (dn[0] || "D").toUpperCase();
  }

  /* --- Rank progress card ------------------------------------------- */
  const { next } = rankForXp(state.totalXp);
  const rankNameEl = document.getElementById("profile-rank-name");
  const rankNextEl = document.getElementById("profile-rank-next");
  const rankFillEl = document.getElementById("profile-xp-fill");
  if (rankNameEl) rankNameEl.textContent = current.name;
  paintRankTier(rankNameEl, current);
  paintRankTier(document.querySelector(".rank-seal"), current);
  if (rankNextEl) {
    rankNextEl.textContent = next
      ? `${(next.min - state.totalXp).toLocaleString()} XP to ${next.name}`
      : "Max rank reached";
  }
  if (rankFillEl) {
    const pct = next
      ? Math.min(100, ((state.totalXp - current.min) / (next.min - current.min)) * 100)
      : 100;
    rankFillEl.style.width = pct + "%";
  }

  /* --- Headline stat strip ------------------------------------------ */
  const { wins, losses, ties, eloRating } = cachedProfile;
  const setStat = (id, text, tone) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.classList.remove("positive", "negative");
    if (tone) el.classList.add(tone);
  };
  setStat("profile-stat-elo", eloRating !== null ? eloRating.toLocaleString() : "\u2014");
  const decided = (wins || 0) + (losses || 0) + (ties || 0);
  if (decided > 0) {
    const wr = Math.round(((wins || 0) / decided) * 100);
    setStat("profile-stat-winrate", wr + "%", wr >= 50 ? "positive" : "negative");
  } else {
    setStat("profile-stat-winrate", "\u2014");
  }
  setStat("profile-stat-record", `${wins || 0}\u2013${losses || 0}\u2013${ties || 0}`);
  setStat("profile-stat-runs", (state.totalRuns || 0).toLocaleString());
  setStat("profile-stat-streak", String(state.streak || 0));

  const values = SKILL_KEYS.map(k => state.skills[k] || 0);
  drawRadar(document.getElementById("profile-radar-canvas"), values);
  const radarNote = document.getElementById("profile-radar-note");
  if (radarNote) {
    radarNote.textContent = values.some(v => v > 0)
      ? "Strongest axis leads; the shape fills out as you practise each mode."
      : "Win practice rounds to push each axis outward.";
  }

  /* --- Practice focus: same skill values as the radar, ranked weakest-first
     so the card answers "what do I do next" rather than repeating the shape. */
  const bars = document.getElementById("profile-skill-bars");
  if (bars) {
    bars.innerHTML = SKILL_KEYS
      .map((k, i) => ({ label: SKILL_LABELS[i], val: state.skills[k] || 0 }))
      .sort((a, b) => a.val - b.val)
      .map(sk => `
        <li class="skill-bar-row">
          <span class="skill-bar-name">${sk.label}</span>
          <span class="skill-bar-track"><span class="skill-bar-fill" style="width:${Math.max(2, Math.min(100, sk.val))}%"></span></span>
          <span class="skill-bar-val">${Math.round(sk.val)}</span>
        </li>`)
      .join("");
  }

  let unlockedCount = 0;
  const wall = document.getElementById("badge-wall");
  wall.innerHTML = "";
  BADGES.forEach(b => {
    const unlocked = b.cond(state);
    if (unlocked) unlockedCount++;
    const el = document.createElement("div");
    el.className = "badge-item" + (unlocked ? " unlocked" : "");
    el.title = b.name;
    el.innerHTML = unlocked
      ? `<span style="font-size:20px">${b.icon}</span>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" stroke-width="1.6"/></svg>`;
    wall.appendChild(el);
  });

  const wallCount = document.getElementById("profile-badge-count");
  if (wallCount) wallCount.textContent = `${unlockedCount} / ${BADGES.length}`;

  /* Contribution-style heatmap: 7 weekday rows filled column-major, so the
     final column is the current (partial) week. Sized in fixed 14px cells by
     CSS rather than 1fr, otherwise the cells balloon on the wide profile. */
  const heat = document.getElementById("heatmap-grid");
  heat.innerHTML = "";
  const weekdayToday = new Date().getDay();
  const heatDays = 25 * 7 + weekdayToday + 1;
  for (let i = heatDays - 1; i >= 0; i--) {
    const day = todayStr(-i);
    const count = state.activity[day] || 0;
    const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
    const cell = document.createElement("div");
    cell.className = "heat-cell heat-" + level;
    cell.title = `${day}: ${count} run${count === 1 ? "" : "s"}`;
    heat.appendChild(cell);
  }
}

document.getElementById("reset-progress-btn").addEventListener("click", () => {
  if (window.confirm("Reset all progress? This can't be undone.")) {
    state = defaultState();
    saveState();
    renderProfile();
    toast("Progress reset.");
  }
});

/* ---------------------------------------------------------
   13. LEADERBOARD
   XP tabs: mock data + player's own local XP (unchanged behaviour).
   Debate ELO tab: real data from the profiles table.
   --------------------------------------------------------- */

const MOCK_LB_NAMES = ["Aria K.", "Devon P.", "Lena W.", "Mika T.", "Sam R.", "Priya N.", "Jonas L.", "Talia M.", "Eli B.", "Nadia F."];

// Which tab is currently active (data-lb attribute value)
let activeLbTab = "weekly";

async function renderLeaderboard() {
  const list = document.getElementById("lb-list");
  list.innerHTML = "";

  if (activeLbTab === "elo") {
    await renderEloLeaderboard(list);
  } else {
    renderXpLeaderboard(list);
  }
}

function renderXpLeaderboard(list) {
  const rng = mulberry32(42);
  const mockScores = MOCK_LB_NAMES.map(n => ({ name: n, score: Math.floor(400 + rng() * 3200) }));
  mockScores.push({ name: cachedProfile.displayName || "You", score: state.totalXp, self: true });
  mockScores.sort((a, b) => b.score - a.score);

  mockScores.forEach((row, i) => {
    const el = document.createElement("div");
    el.className = "lb-row" + (row.self ? " self" : "");
    el.style.animationDelay = (i * 0.03) + "s";
    const initials = row.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
    el.innerHTML = `
      <span class="lb-rank">${i + 1}</span>
      <span class="lb-avatar">${initials}</span>
      <span class="lb-info">
        <div class="lb-name">${row.name}${row.self ? " (you)" : ""}</div>
        <div class="lb-sub">${rankForXp(row.score).current.name}</div>
      </span>
      <span class="lb-score">${row.score.toLocaleString()} XP</span>
    `;
    list.appendChild(el);
  });
}

async function renderEloLeaderboard(list) {
  // Show a loading hint while we fetch
  const loadEl = document.createElement("div");
  loadEl.className = "lb-row";
  loadEl.style.opacity = "0.5";
  loadEl.innerHTML = `<span style="font-size:0.85rem;padding:1rem 0">Loading ELO rankings…</span>`;
  list.appendChild(loadEl);

  try {
    const sb = window.mpSupabase && window.mpSupabase.client;
    if (!sb) throw new Error("Supabase not ready");
    // Wait for auth so we know our own uid
    const myUid = await window.mpSupabase.ready;

    const { data, error } = await sb
      .from("profiles")
      .select("uid, display_name, elo_rating, wins, losses, ties")
      .order("elo_rating", { ascending: false })
      .limit(50);

    if (error) throw error;

    list.innerHTML = "";
    if (!data || !data.length) {
      list.innerHTML = `<p style="padding:1.5rem;opacity:0.5;font-size:0.9rem">No ELO data yet — complete a multiplayer debate to appear here.</p>`;
      return;
    }

    data.forEach((row, i) => {
      const isSelf = row.uid === myUid;
      const name = row.display_name || "Debater";
      const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
      const record = `${row.wins || 0}W / ${row.losses || 0}L / ${row.ties || 0}T`;
      const el = document.createElement("div");
      el.className = "lb-row" + (isSelf ? " self" : "");
      el.style.animationDelay = (i * 0.03) + "s";
      el.innerHTML = `
        <span class="lb-rank">${i + 1}</span>
        <span class="lb-avatar">${initials}</span>
        <span class="lb-info">
          <div class="lb-name">${name}${isSelf ? " (you)" : ""}</div>
          <div class="lb-sub">${record}</div>
        </span>
        <span class="lb-score">${(row.elo_rating || 1200).toLocaleString()} ELO</span>
      `;
      list.appendChild(el);
    });
  } catch (e) {
    console.error("ELO leaderboard fetch failed:", e);
    list.innerHTML = `<p style="padding:1.5rem;opacity:0.5;font-size:0.9rem">Couldn't load ELO rankings — check your connection.</p>`;
  }
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

document.querySelectorAll(".lb-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".lb-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    activeLbTab = tab.dataset.lb || "weekly";
    playClick();
    const list = document.getElementById("lb-list");
    list.classList.add("is-loading");
    // ELO tab needs a real network call, so remove the loading class only after
    // the async render resolves. XP tabs are synchronous and get the 90ms beat.
    if (activeLbTab === "elo") {
      renderLeaderboard().then(() => list.classList.remove("is-loading"));
    } else {
      window.setTimeout(() => {
        renderLeaderboard();
        list.classList.remove("is-loading");
      }, 90);
    }
  });
});

/* ---------------------------------------------------------
   14. DAILY CHALLENGE
   --------------------------------------------------------- */

function msUntilMidnight() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next - now;
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

const DAILY_MODE_ROTATION = ["steelman", "fallacy", "rebuttal", "speed"];
function getDailyMode() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return DAILY_MODE_ROTATION[dayIndex % DAILY_MODE_ROTATION.length];
}

function isDailyDone() {
  return state.dailyCompletedDate === todayStr();
}

function updateDailyCountdownAll() {
  const modeKey = getDailyMode();
  const mode = MODE_META[modeKey];
  const done = isDailyDone();
  document.getElementById("daily-title").textContent = done ? "Challenge Complete" : mode.name + " Sprint";
  document.getElementById("daily-desc").textContent = done ? "Come back tomorrow for a new challenge" : "3\u00D7 XP multiplier \u00B7 4 questions";
  tickCountdown();
}

let countdownInterval = window.setInterval(tickCountdown, 1000);
function tickCountdown() {
  const txt = formatCountdown(msUntilMidnight());
  const a = document.getElementById("daily-countdown");
  const b = document.getElementById("daily-detail-timer");
  if (a) a.textContent = txt;
  if (b) b.textContent = txt;
}

function renderDailyDetail() {
  const modeKey = getDailyMode();
  const mode = MODE_META[modeKey];
  const done = isDailyDone();
  document.getElementById("daily-detail-title").textContent = mode.name + " Sprint";
  document.getElementById("daily-detail-desc").textContent = `4 hand-picked questions from ${mode.name}. Complete today for a 3\u00D7 XP multiplier.`;
  const startBtn = document.getElementById("daily-start-btn");
  startBtn.textContent = done ? "Completed \u2014 See you tomorrow" : "Start Challenge";
  startBtn.disabled = done;
  startBtn.style.opacity = done ? "0.5" : "1";
  tickCountdown();
}

document.getElementById("daily-start-btn").addEventListener("click", () => {
  if (isDailyDone()) return;
  playClick();
  const modeKey = getDailyMode();
  const mode = MODE_META[modeKey];
  // Seeded so the same 4 questions show all day (replaying the tab or
  // reopening later won't reshuffle them), and a fresh 4 arrive tomorrow.
  let pool = seededShuffle(mode.data.slice(), `daily-${todayStr()}-${modeKey}`).slice(0, 4);

  gameCtx = {
    modeKey, mode, questions: pool,
    index: 0, correctCount: 0,
    streakCur: 0, streakBest: 0,
    score: 0,
    isDaily: true, xpMultiplier: 3
  };
  document.getElementById("game-mode-label").textContent = mode.name + " \u00B7 Daily";
  showScreen("game");
  renderQuestion();
});

// Wrap finishGame to mark daily completion when relevant
const _origFinishGame = finishGame;
finishGame = function () {
  const wasDaily = gameCtx.isDaily;
  _origFinishGame();
  if (wasDaily) {
    state.dailyCompletedDate = todayStr();
    saveState();
  }
};

/* ---------------------------------------------------------
   15. INIT
   --------------------------------------------------------- */

let resizeRedrawTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(resizeRedrawTimer);
  resizeRedrawTimer = setTimeout(() => {
    const values = SKILL_KEYS.map(k => state.skills[k] || 0);
    if (activeScreen === "summary") {
      const c = document.getElementById("radar-canvas");
      if (c) drawRadar(c, values);
    } else if (activeScreen === "profile") {
      const c = document.getElementById("profile-radar-canvas");
      if (c) drawRadar(c, values);
    }
  }, 150);
});

let authMode = "login"; // "login" | "signup" | "forgot" | "reset"

// Swaps which card is visible inside the auth screen. "login"/"signup" show
// the normal tabs + email/password form; "forgot" shows the reset-link
// request form; "reset" shows the set-new-password form (reachable only via
// a PASSWORD_RECOVERY session, see init()).
function enterAuthMode(mode) {
  authMode = mode;
  const tabs = document.getElementById("auth-tab-login")?.closest(".auth-tabs");
  const loginForm = document.getElementById("auth-form");
  const forgotForm = document.getElementById("auth-forgot-form");
  const resetForm = document.getElementById("auth-reset-form");
  const tabLogin = document.getElementById("auth-tab-login");
  const tabSignup = document.getElementById("auth-tab-signup");
  const submitBtn = document.getElementById("auth-submit-btn");
  if (!loginForm || !forgotForm || !resetForm) return;

  [tabs, loginForm, forgotForm, resetForm].forEach(el => el && el.classList.add("hidden"));

  if (mode === "forgot") {
    forgotForm.classList.remove("hidden");
  } else if (mode === "reset") {
    resetForm.classList.remove("hidden");
  } else {
    tabs && tabs.classList.remove("hidden");
    loginForm.classList.remove("hidden");
    if (tabLogin && tabSignup && submitBtn) {
      const isLogin = mode !== "signup";
      tabLogin.classList.toggle("active", isLogin);
      tabSignup.classList.toggle("active", !isLogin);
      submitBtn.textContent = isLogin ? "Log In" : "Sign Up";
    }
  }
}

function setupAuthEventListeners() {
  const tabLogin = document.getElementById("auth-tab-login");
  const tabSignup = document.getElementById("auth-tab-signup");
  const submitBtn = document.getElementById("auth-submit-btn");
  const emailInput = document.getElementById("auth-email");
  const passwordInput = document.getElementById("auth-password");
  const alertEl = document.getElementById("auth-alert");

  if (!tabLogin || !tabSignup || !submitBtn || !emailInput || !passwordInput || !alertEl) {
    return; // guard if elements don't exist
  }

  function showAlert(msg, type = "error") {
    alertEl.textContent = msg;
    alertEl.className = `auth-alert ${type}`;
    alertEl.classList.remove("hidden");
  }

  function hideAlert() {
    alertEl.classList.add("hidden");
    alertEl.textContent = "";
  }

  tabLogin.addEventListener("click", () => {
    playClick();
    enterAuthMode("login");
    hideAlert();
  });

  tabSignup.addEventListener("click", () => {
    playClick();
    enterAuthMode("signup");
    hideAlert();
  });

  submitBtn.addEventListener("click", async () => {
    playClick();
    hideAlert();

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    if (!email || !password) {
      showAlert("Please enter both email and password.");
      return;
    }

    if (password.length < 6) {
      showAlert("Password must be at least 6 characters long.");
      return;
    }

    submitBtn.disabled = true;
    const origText = submitBtn.textContent;
    submitBtn.textContent = authMode === "login" ? "Logging in..." : "Signing up...";

    try {
      if (authMode === "login") {
        const { error } = await window.mpSupabase.signIn(email, password);
        if (error) throw error;
        showAlert("Logged in successfully!", "success");
        // Clear forms
        emailInput.value = "";
        passwordInput.value = "";
        // Wait a brief moment to show success, then redirect
        window.setTimeout(() => {
          hideAlert();
          showScreen("home");
          fetchProfileFromServer();
        }, 800);
      } else {
        const { error } = await window.mpSupabase.signUp(email, password);
        if (error) throw error;
        
        // Check if auto-signed in immediately (no confirmation email required setting)
        const session = await window.mpSupabase.getSession();
        if (session && session.user) {
          showAlert("Account created successfully!", "success");
          emailInput.value = "";
          passwordInput.value = "";
          window.setTimeout(() => {
            hideAlert();
            showScreen("home");
            fetchProfileFromServer();
          }, 800);
        } else {
          showAlert("Signup successful! Please check your email to confirm your account.", "success");
          emailInput.value = "";
          passwordInput.value = "";
        }
      }
    } catch (e) {
      console.error("Auth action failed:", e);
      showAlert(e.message || "An authentication error occurred. Please try again.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = origText;
    }
  });

  // Wire up "Forgot password?" -> the reset-link request form
  const forgotLink = document.getElementById("auth-forgot-link");
  const backToLoginLink = document.getElementById("auth-back-to-login-link");
  const forgotSubmitBtn = document.getElementById("auth-forgot-submit-btn");
  const forgotEmailInput = document.getElementById("auth-forgot-email");
  const forgotAlertEl = document.getElementById("auth-forgot-alert");

  function showForgotAlert(msg, type = "error") {
    if (!forgotAlertEl) return;
    forgotAlertEl.textContent = msg;
    forgotAlertEl.className = `auth-alert ${type}`;
    forgotAlertEl.classList.remove("hidden");
  }

  if (forgotLink) {
    forgotLink.addEventListener("click", () => {
      playClick();
      hideAlert();
      if (forgotAlertEl) forgotAlertEl.classList.add("hidden");
      if (forgotEmailInput) forgotEmailInput.value = emailInput.value.trim();
      enterAuthMode("forgot");
    });
  }

  if (backToLoginLink) {
    backToLoginLink.addEventListener("click", () => {
      playClick();
      if (forgotAlertEl) forgotAlertEl.classList.add("hidden");
      enterAuthMode("login");
    });
  }

  if (forgotSubmitBtn && forgotEmailInput) {
    forgotSubmitBtn.addEventListener("click", async () => {
      playClick();
      if (forgotAlertEl) forgotAlertEl.classList.add("hidden");

      const email = forgotEmailInput.value.trim();
      if (!email) {
        showForgotAlert("Please enter your email address.");
        return;
      }
      if (!window.mpSupabase || !window.mpSupabase.resetPasswordForEmail) {
        showForgotAlert("Password reset isn't available right now.");
        return;
      }

      forgotSubmitBtn.disabled = true;
      const origText = forgotSubmitBtn.textContent;
      forgotSubmitBtn.textContent = "Sending...";

      try {
        const { error } = await window.mpSupabase.resetPasswordForEmail(email);
        if (error) throw error;
        // Deliberately the same message whether or not the address has an
        // account — this endpoint must not reveal which emails are registered.
        showForgotAlert("If an account exists for that email, a reset link is on its way.", "success");
        forgotEmailInput.value = "";
      } catch (e) {
        console.error("Password reset request failed:", e);
        showForgotAlert(e.message || "Couldn't send the reset link. Please try again.");
      } finally {
        forgotSubmitBtn.disabled = false;
        forgotSubmitBtn.textContent = origText;
      }
    });
  }

  // Wire up the "set new password" form (only reachable via a
  // PASSWORD_RECOVERY session — see init()/enterAuthMode("reset"))
  const resetSubmitBtn = document.getElementById("auth-reset-submit-btn");
  const newPasswordInput = document.getElementById("auth-newpassword");
  const newPasswordConfirmInput = document.getElementById("auth-newpassword-confirm");
  const resetAlertEl = document.getElementById("auth-reset-alert");

  function showResetAlert(msg, type = "error") {
    if (!resetAlertEl) return;
    resetAlertEl.textContent = msg;
    resetAlertEl.className = `auth-alert ${type}`;
    resetAlertEl.classList.remove("hidden");
  }

  if (resetSubmitBtn && newPasswordInput && newPasswordConfirmInput) {
    resetSubmitBtn.addEventListener("click", async () => {
      playClick();
      if (resetAlertEl) resetAlertEl.classList.add("hidden");

      const newPassword = newPasswordInput.value.trim();
      const confirmPassword = newPasswordConfirmInput.value.trim();

      if (!newPassword || !confirmPassword) {
        showResetAlert("Please fill in both fields.");
        return;
      }
      if (newPassword.length < 6) {
        showResetAlert("Password must be at least 6 characters long.");
        return;
      }
      if (newPassword !== confirmPassword) {
        showResetAlert("Passwords don't match.");
        return;
      }
      if (!window.mpSupabase || !window.mpSupabase.updatePassword) {
        showResetAlert("Password reset isn't available right now.");
        return;
      }

      resetSubmitBtn.disabled = true;
      const origText = resetSubmitBtn.textContent;
      resetSubmitBtn.textContent = "Saving...";

      try {
        const { error } = await window.mpSupabase.updatePassword(newPassword);
        if (error) throw error;
        showResetAlert("Password updated! Taking you in...", "success");
        newPasswordInput.value = "";
        newPasswordConfirmInput.value = "";
        window.setTimeout(() => {
          if (resetAlertEl) resetAlertEl.classList.add("hidden");
          showScreen("home");
          fetchProfileFromServer();
        }, 800);
      } catch (e) {
        console.error("Password update failed:", e);
        showResetAlert(e.message || "Couldn't update your password. Please try again.");
      } finally {
        resetSubmitBtn.disabled = false;
        resetSubmitBtn.textContent = origText;
      }
    });
  }

  // Wire up the Sign Out button
  const signOutBtn = document.getElementById("profile-signout-btn");
  if (signOutBtn) {
    signOutBtn.addEventListener("click", async () => {
      if (window.confirm("Are you sure you want to sign out?")) {
        playClick();
        try {
          await window.mpSupabase.signOut();
          // Reset cached profiles
          cachedProfile.eloRating = null;
          cachedProfile.wins = null;
          cachedProfile.losses = null;
          cachedProfile.ties = null;
          cachedProfile.displayName = null;
          cachedProfile.avatarFileId = null;
          if (window.avatarRenderProfile) window.avatarRenderProfile();
          
          // Redirect to auth
          showScreen("auth");
          enterAuthMode("login");
        } catch (e) {
          console.error("Sign out failed:", e);
          toast("Sign out failed.");
        }
      }
    });
  }
}

/* ---------------------------------------------------------
   PROFILE DISPLAY-NAME EDITOR
   Reads/writes cachedProfile.displayName through the same
   sync_profile RPC (via pushProfileToServer()) every other
   profile field already uses — see README-AVATAR.md for why
   that's the established pattern. Validation here mirrors
   sync_profile()'s server-side check (2-24 chars, letters/
   numbers/spaces/. _ ' -) so bad input never leaves the client.
   --------------------------------------------------------- */

const DISPLAY_NAME_PATTERN = /^[A-Za-z0-9 _.'-]+$/;

function setupProfileNameEditListeners() {
  const nameRow    = document.getElementById("profile-name-row");
  const nameDisplay = document.getElementById("profile-display-name");
  const editBtn    = document.getElementById("profile-name-edit-btn");
  const editForm   = document.getElementById("profile-name-edit-form");
  const nameInput  = document.getElementById("profile-name-input");
  const saveBtn    = document.getElementById("profile-name-save-btn");
  const cancelBtn  = document.getElementById("profile-name-cancel-btn");

  if (!nameRow || !nameDisplay || !editBtn || !editForm || !nameInput || !saveBtn || !cancelBtn) {
    return; // guard if elements don't exist
  }

  function openEdit() {
    nameInput.value = cachedProfile.displayName || "";
    nameRow.classList.add("hidden");
    editForm.classList.remove("hidden");
    nameInput.focus();
    nameInput.select();
  }

  function closeEdit() {
    editForm.classList.add("hidden");
    nameRow.classList.remove("hidden");
  }

  editBtn.addEventListener("click", () => {
    playClick();
    openEdit();
  });

  cancelBtn.addEventListener("click", () => {
    playClick();
    closeEdit();
  });

  async function save() {
    const cleaned = nameInput.value.trim();

    if (cleaned.length < 2 || cleaned.length > 24) {
      toast("Name must be 2–24 characters.");
      return;
    }
    if (!DISPLAY_NAME_PATTERN.test(cleaned)) {
      toast("Only letters, numbers, spaces, and . _ ' - are allowed.");
      return;
    }

    const prevName = cachedProfile.displayName;
    saveBtn.disabled = true;
    const prevBtnText = saveBtn.textContent;
    saveBtn.textContent = "Saving…";

    cachedProfile.displayName = cleaned; // optimistic
    const ok = await pushProfileToServer();

    saveBtn.disabled = false;
    saveBtn.textContent = prevBtnText;

    if (ok) {
      nameDisplay.textContent = cleaned;
      closeEdit();
      toast("Name updated.");
    } else {
      cachedProfile.displayName = prevName; // roll back
      toast("Couldn't save — check your connection and try again.");
    }
  }

  saveBtn.addEventListener("click", () => {
    playClick();
    save();
  });

  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeEdit();
    }
  });
}

function init() {
  setupAuthEventListeners();
  setupProfileNameEditListeners();
  showScreen("splash");

  // If the PASSWORD_RECOVERY event fires late (e.g. the reset link opened
  // in a tab that already finished init and is sitting on Home), jump to
  // the "set new password" form instead of leaving them stuck signed into
  // a recovery session on the wrong screen.
  window.addEventListener("veritas:password-recovery", () => {
    showScreen("auth");
    enterAuthMode("reset");
  });

  window.setTimeout(async () => {
    try {
      if (window.mpSupabase) {
        const session = await window.mpSupabase.getSession();
        if (session && session.user) {
          if (window.mpSupabase.isPasswordRecovery) {
            // Signed in via a "reset password" email link, not a normal
            // login — collect a new password before letting them into the app.
            showScreen("auth");
            enterAuthMode("reset");
          } else {
            // User is authenticated, proceed to Home
            showScreen("home");
            fetchProfileFromServer();
          }
        } else {
          // User is not authenticated, show Auth screen
          showScreen("auth");
        }
      } else {
        showScreen("home");
      }
    } catch (e) {
      console.error("Session check failed:", e);
      showScreen("auth");
    }
  }, 1900);
}

document.addEventListener("DOMContentLoaded", init);
if (document.readyState !== "loading") init();

/* ---------------------------------------------------------
   16. BRIDGE — small surface used by multiplayer.js
   --------------------------------------------------------- */
window.DA = {
  toast: toast,
  todayStr: todayStr,
  showScreen: showScreen,
  playClick: playClick,
  awardXp: function (amount, opts) {
    opts = opts || {};
    state.totalXp += amount;
    state.totalRuns += 1;
    if (opts.trackActivity !== false) {
      const key = todayStr();
      state.activity[key] = (state.activity[key] || 0) + 1;
    }
    saveState();
    if (activeScreen === "home") renderHome();
    if (activeScreen === "profile") renderProfile();
  },
  getCachedProfile: function () {
    return cachedProfile;
  },
  fetchProfile: fetchProfileFromServer,
  pushProfile: function () {
    return typeof pushProfileToServer === "function" ? pushProfileToServer() : Promise.resolve();
  }
};

/* ---------------------------------------------------------
   17. SUPABASE PROFILE SYNC
   Reads elo_rating / wins / losses / ties / display_name from
   the profiles table (server-side truth) and caches them so
   renderHome / renderProfile / renderLeaderboard can display
   real ELO data. Also pushes local progress to sync_profile.

   All calls are best-effort: failures are logged but never
   surface as errors to the user — the app degrades gracefully
   back to showing "—" placeholders.
   --------------------------------------------------------- */

// In-memory cache; populated once auth is ready, then on every
// saveState() call (so the profile stays fresh after XP changes).
const cachedProfile = {
  eloRating:    null,
  wins:         null,
  losses:       null,
  ties:         null,
  displayName:  null,
  avatarFileId: null   // Appwrite Storage file id, sourced from profiles.progress
};

async function fetchProfileFromServer() {
  try {
    if (!window.mpSupabase) return;        // Supabase not loaded yet
    const myUid = await window.mpSupabase.ready;
    if (!myUid) return;
    const { data, error } = await window.mpSupabase.client
      .from("profiles")
      .select("elo_rating, wins, losses, ties, display_name, progress")
      .eq("uid", myUid)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      cachedProfile.eloRating    = data.elo_rating   ?? null;
      cachedProfile.wins         = data.wins          ?? null;
      cachedProfile.losses       = data.losses        ?? null;
      cachedProfile.ties         = data.ties          ?? null;
      cachedProfile.displayName  = data.display_name  ?? null;
      cachedProfile.avatarFileId = (data.progress && data.progress.avatarFileId) || null;
      // Re-render whichever screens are currently visible
      if (activeScreen === "home")        renderHome();
      if (activeScreen === "profile")     renderProfile();
      if (activeScreen === "leaderboard" && activeLbTab !== "elo") renderLeaderboard();
      if (window.avatarRenderProfile) window.avatarRenderProfile();
    }
  } catch (e) {
    console.error("fetchProfileFromServer failed:", e);
  }
}

async function pushProfileToServer() {
  try {
    if (!window.mpSupabase) return false;
    const myUid = await window.mpSupabase.ready;
    if (!myUid) return false;
    const progress = {
      totalXp:      state.totalXp,
      streak:       state.streak,
      totalRuns:    state.totalRuns,
      skills:       state.skills,
      modeStats:    state.modeStats,
      avatarFileId: cachedProfile.avatarFileId || null
    };
    const { error } = await window.mpSupabase.client.rpc("sync_profile", {
      p_display_name: cachedProfile.displayName || null,
      p_progress:     progress
    });
    if (error) throw error;
    return true;
  } catch (e) {
    // Non-fatal for the routine/background callers (localStorage is the
    // source of truth for solo progress) — they ignore the return value.
    // User-initiated callers (e.g. the display-name editor) check it to
    // show real success/failure feedback instead of assuming it worked.
    console.warn("pushProfileToServer failed (non-fatal):", e);
    return false;
  }
}

// Kick off a profile fetch once Supabase is available (runs in the
// background — won't block the initial splash/home render).
if (window.mpSupabase) {
  fetchProfileFromServer();
} else {
  // mpSupabase is defined by supabase-config.js which loads AFTER app.js,
  // so wait one tick for it to be ready.
  window.setTimeout(fetchProfileFromServer, 0);
}

})();
