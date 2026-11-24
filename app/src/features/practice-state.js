import { masteryScores } from "./mastery.js";

export const STORAGE_KEY = "veritas_save_v1";
export const PROGRESS_SCHEMA_VERSION = 3;

export function progressStorageKey(owner = "guest") {
  const normalized = typeof owner === "string" && owner.trim() ? owner.trim() : "guest";
  return `${STORAGE_KEY}:v${PROGRESS_SCHEMA_VERSION}:${normalized}`;
}

export function defaultState() {
  return {
    totalXp: 0, streak: 0, lastPlayDate: null, totalRuns: 0,
    skills: { logic: 0, speed: 0, rhetoric: 0, analysis: 0, strategy: 0 },
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    masteryVersion: 2, assessments: {}, legacySkills: {},
    modeStats: {}, dailyCompletedDate: null, activity: {}, quests: null,
    achievements: [], bestCombo: 0
  };
}

export function normalizeProgress(parsed) {
  const base = defaultState();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
  const assessments = parsed.assessments && typeof parsed.assessments === 'object' && !Array.isArray(parsed.assessments)
    ? Object.fromEntries(Object.entries(parsed.assessments).filter(([, r]) => r && typeof r === 'object' && Number.isFinite(r.at) && ['logic','speed','rhetoric','analysis','strategy'].includes(r.skill) && ['easy','medium','hard'].includes(r.difficulty) && typeof r.correct === 'boolean'))
    : {};
  return {
    ...base,
    ...parsed,
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    masteryVersion: 2,
    assessments,
    legacySkills: parsed.masteryVersion === 2 ? (parsed.legacySkills || {}) : (parsed.skills || {}),
    skills: masteryScores(assessments),
    modeStats: parsed.modeStats && typeof parsed.modeStats === "object" ? parsed.modeStats : {},
    activity: parsed.activity && typeof parsed.activity === "object" && !Array.isArray(parsed.activity) ? parsed.activity : {},
    achievements: Array.isArray(parsed.achievements) ? parsed.achievements : []
  };
}

export function loadProgress(storage = globalThis.localStorage, owner = "guest") {
  try {
    const scopedKey = progressStorageKey(owner);
    const raw = storage?.getItem(scopedKey);
    if (raw) return normalizeProgress(JSON.parse(raw));
    // Migrate the historical shared key into guest space only. Never attach
    // ambiguous legacy data to an authenticated account.
    if (owner === "guest") {
      const legacy = storage?.getItem(STORAGE_KEY);
      if (legacy) {
        const migrated = normalizeProgress(JSON.parse(legacy));
        storage?.setItem(scopedKey, JSON.stringify(migrated));
        return migrated;
      }
    }
    return defaultState();
  } catch {
    return defaultState();
  }
}

export function saveProgress(state, storage = globalThis.localStorage, owner = "guest") {
  try {
    storage?.setItem(progressStorageKey(owner), JSON.stringify(normalizeProgress(state)));
    return true;
  } catch {
    return false;
  }
}

export function mergeProgress(local, remote) {
  const a = normalizeProgress(local);
  const b = normalizeProgress(remote);
  const assessments = { ...b.assessments, ...a.assessments };
  const byTimestamp = (x, y) => !x ? y : !y ? x : Date.parse(y) > Date.parse(x) ? y : x;
  const modeStats = { ...b.modeStats };
  for (const [mode, stats] of Object.entries(a.modeStats)) {
    const prior = modeStats[mode] || {};
    modeStats[mode] = {
      ...prior, ...stats,
      bestPct: Math.max(Number(prior.bestPct) || 0, Number(stats.bestPct) || 0),
      bestScore: Math.max(Number(prior.bestScore) || 0, Number(stats.bestScore) || 0),
      plays: Math.max(Number(prior.plays) || 0, Number(stats.plays) || 0),
      lastPlayedAt: byTimestamp(prior.lastPlayedAt, stats.lastPlayedAt),
    };
  }
  return normalizeProgress({
    ...b, ...a,
    totalXp: Math.max(a.totalXp || 0, b.totalXp || 0),
    totalRuns: Math.max(a.totalRuns || 0, b.totalRuns || 0),
    streak: Math.max(a.streak || 0, b.streak || 0),
    lastPlayDate: [a.lastPlayDate, b.lastPlayDate].filter(Boolean).sort().at(-1) || null,
    dailyCompletedDate: [a.dailyCompletedDate, b.dailyCompletedDate].filter(Boolean).sort().at(-1) || null,
    assessments, modeStats,
    achievements: [...new Set([...(b.achievements || []), ...(a.achievements || [])])],
  });
}
