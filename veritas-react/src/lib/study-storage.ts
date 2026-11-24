export type LessonRecord = { completions: number; correct: number; attempts: number; reviewAt: string | null; intervalDays?: number; lastCompletedAt?: string };
export type StudyStore = { target: number; lessons: Record<string, LessonRecord>; sessions: { lessonId: string; at: string; week: string }[]; bookmarks: any[]; reminder: boolean; reminderDay: string; reminderSeenWeeks: string[] };

const legacyReactProgressKey = "veritas-react-study-progress";
const legacyReactPrefsKey = "veritas-react-study-prefs";
const legacyReactNotesKey = "veritas-react-study-notes";
export const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export function blankStore(): StudyStore { return { target: 3, lessons: {}, sessions: [], bookmarks: [], reminder: false, reminderDay: "Monday", reminderSeenWeeks: [] }; }
function parseJson(value: string | null) { try { return value ? JSON.parse(value) : null; } catch { return null; } }
export function readStudyStore(storage: Pick<Storage, "getItem">, ownerUid: string): StudyStore {
  const current = parseJson(storage.getItem(`veritas_study_v1:${ownerUid}`));
  if (current && typeof current === "object" && !Array.isArray(current)) return {
    ...blankStore(), ...current,
    lessons: current.lessons && typeof current.lessons === "object" && !Array.isArray(current.lessons) ? current.lessons : {},
    sessions: Array.isArray(current.sessions) ? current.sessions.filter((item: any) => item && typeof item.lessonId === "string" && typeof item.week === "string" && typeof item.at === "string").slice(-120) : [],
    bookmarks: Array.isArray(current.bookmarks) ? current.bookmarks.filter((item: any) => item && typeof item.title === "string" && typeof item.excerpt === "string" && typeof item.type === "string").slice(0,100) : [],
    reminderSeenWeeks: Array.isArray(current.reminderSeenWeeks) ? current.reminderSeenWeeks.filter((item: any) => typeof item === "string").slice(-32) : [],
    target: [2,3,5].includes(current.target) ? current.target : 3,
    reminder: current.reminder === true,
    reminderDay: days.includes(current.reminderDay) ? current.reminderDay : "Monday",
  };
  // Unowned legacy notes belong to guest storage, never a newly signed-in account.
  if (ownerUid !== "guest") return blankStore();
  const oldProgress = parseJson(storage.getItem(legacyReactProgressKey)) || {};
  const oldPrefs = parseJson(storage.getItem(legacyReactPrefsKey)) || {};
  const oldNotes = parseJson(storage.getItem(legacyReactNotesKey)) || [];
  const lessons = Object.fromEntries(Object.entries(oldProgress && typeof oldProgress === "object" ? oldProgress : {}).map(([id, value]) => [id, { completions: Number(value) || 0, correct: 0, attempts: 0, reviewAt: null }]));
  return { ...blankStore(), lessons, bookmarks: Array.isArray(oldNotes) ? oldNotes.filter(item => item && typeof item.title === "string" && typeof item.excerpt === "string" && typeof item.type === "string").slice(0,100) : [], reminder: Boolean(oldPrefs.reminder), reminderDay: days.includes(oldPrefs.day) ? oldPrefs.day : "Monday", reminderSeenWeeks: Array.isArray(oldPrefs.dismissedWeeks) ? oldPrefs.dismissedWeeks.filter((item: unknown) => typeof item === "string").slice(-32) : [] };
}
