export const STORAGE_KEY = "veritas_save_v1";

export function defaultState() {
  return {
    totalXp: 0, streak: 0, lastPlayDate: null, totalRuns: 0,
    skills: { logic: 0, speed: 0, rhetoric: 0, analysis: 0, strategy: 0 },
    modeStats: {}, dailyCompletedDate: null, activity: {}, quests: null,
    achievements: [], bestCombo: 0
  };
}

export function normalizeProgress(parsed) {
  const base = defaultState();
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return base;
  return {
    ...base,
    ...parsed,
    skills: { ...base.skills, ...(parsed.skills && typeof parsed.skills === "object" ? parsed.skills : {}) },
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
