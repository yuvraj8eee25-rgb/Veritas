import { masteryScores } from "./mastery.js";

export const STORAGE_KEY = "veritas_save_v1";

export function defaultState() {
  return {
    totalXp: 0, streak: 0, lastPlayDate: null, totalRuns: 0,
    skills: { logic: 0, speed: 0, rhetoric: 0, analysis: 0, strategy: 0 },
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
    masteryVersion: 2,
    assessments,
    legacySkills: parsed.masteryVersion === 2 ? (parsed.legacySkills || {}) : (parsed.skills || {}),
    skills: masteryScores(assessments),
    modeStats: parsed.modeStats && typeof parsed.modeStats === "object" ? parsed.modeStats : {},
    activity: parsed.activity && typeof parsed.activity === "object" && !Array.isArray(parsed.activity) ? parsed.activity : {},
    achievements: Array.isArray(parsed.achievements) ? parsed.achievements : []
  };
}

export function loadProgress(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? normalizeProgress(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveProgress(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(normalizeProgress(state)));
    return true;
  } catch {
    return false;
  }
}
