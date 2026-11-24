import { readEvidenceCard } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import { readArgumentMap } from "./argument-map.ts";
export type LibraryEntry = { key: string; label: string; value: unknown };
const record = (value: unknown): value is Record<string, any> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum: number): value is string => typeof value === "string" && value.length <= maximum;
const array = (value: unknown, maximum: number): value is any[] => Array.isArray(value) && value.length <= maximum;
const date = (value: unknown): value is string => text(value, 40) && Number.isFinite(Date.parse(value));
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

function study(value: unknown) {
  return record(value) && [2, 3, 5].includes(value.target) && record(value.lessons)
    && Object.entries(value.lessons).every(([id, lesson]) => text(id, 100) && record(lesson) && number(lesson.completions) && number(lesson.correct) && number(lesson.attempts) && (lesson.reviewAt === null || date(lesson.reviewAt)))
    && array(value.sessions, 120) && value.sessions.every(session => record(session) && text(session.lessonId, 100) && date(session.at) && text(session.week, 20))
    && array(value.bookmarks, 500) && value.bookmarks.every(note => record(note) && text(note.title, 500) && text(note.excerpt, 5000) && text(note.type, 100))
    && typeof value.reminder === "boolean" && ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].includes(value.reminderDay)
    && array(value.reminderSeenWeeks, 32) && value.reminderSeenWeeks.every(week => text(week, 20));
}
function paper(value: unknown) {
  if (!record(value) || !text(value.name, 500) || !Number.isInteger(value.totalPages) || value.totalPages < 1 || value.totalPages > 40
    || !array(value.pages, 40) || !value.pages.length || !value.pages.every(page => record(page) && Number.isInteger(page.page) && page.page > 0 && page.page <= value.totalPages && text(page.text, 100000))
    || value.pages.reduce((sum, page) => sum + page.text.length, 0) > 100000) return false;
  const cited = (item: any) => record(item) && text(item.quote, 10000) && item.quote.trim().length > 0
    && value.pages.some((page: any) => page.page === item.page && page.text.replace(/\s+/g, " ").includes(item.quote.replace(/\s+/g, " ")));
  return array(value.points, 100) && value.points.every(point => cited(point) && ["question","method","finding","limitation"].includes(point.kind) && text(point.text, 5000))
    && array(value.cards, 100) && value.cards.every(card => cited(card) && text(card.question, 2000) && text(card.answer, 5000));
}
function reports(value: unknown) {
  return array(value, 30) && value.every(report => record(report) && text(report.topic, 200) && date(report.completedAt)
    && array(report.transcript, 30) && report.transcript.every((turn: any) => record(turn) && ["user","ai"].includes(turn.speaker) && text(turn.text, 10000))
    && (report.verdict == null || (record(report.verdict) && text(report.verdict.summary, 10000))));
}

export function libraryKeys(owner: string) {
  return [`veritas_study_v1:${owner}`, `veritas:evidence-cards:v1:${owner}`, `veritas:paper-study:${owner}`, `veritas:debate-reports:${owner}`, `veritas:argument-maps:${owner}`, `veritas:evidence-tags:v1:${owner}`];
}
export function validateLibraryBackup(owner: string, payload: unknown): LibraryEntry[] {
  if (!record(payload) || new TextEncoder().encode(JSON.stringify(payload)).length > 5_000_000) throw new Error("The backup is invalid or exceeds 5 MB.");
  const validators: { label: string; valid: (value: any) => boolean }[] = [
    { label: "Study plan and notes", valid: study },
    { label: "Evidence cards", valid: value => array(value, 500) && value.every(card => readEvidenceCard(card) !== null) },
    { label: "Paper study", valid: paper },
    { label: "Debate portfolio", valid: reports },
    { label: "Argument maps", valid: value => array(value, 20) && value.every(map => readArgumentMap(map) !== null) && new Set(value.map(map => map.id)).size === value.length },
    { label: "Evidence tags", valid: value => record(value) && Object.entries(value).every(([id, tags]) => text(id, 64) && array(tags, 8) && tags.every(tag => text(tag, 40))) },
  ];
  return libraryKeys(owner).flatMap((key, index) => {
    if (!Object.hasOwn(payload, key)) return [];
    if (!validators[index].valid(payload[key])) throw new Error(`The saved ${validators[index].label.toLowerCase()} could not be validated. Your device data has not been changed.`);
    return [{ key, label: validators[index].label, value: payload[key] }];
  });
}

export function restoreLibrary(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, entries: LibraryEntry[]) {
  const before = entries.map(entry => ({ key: entry.key, raw: storage.getItem(entry.key) }));
  try { for (const entry of entries) storage.setItem(entry.key, JSON.stringify(entry.value)); }
  catch {
    // Remove the new values first so rollback has the space the originals occupied.
    try {
      for (const entry of before) storage.removeItem(entry.key);
      for (const entry of before) if (entry.raw !== null) storage.setItem(entry.key, entry.raw);
    } catch { throw new Error("Storage failed during restore and recovery. Keep your exported backup and review device storage before continuing."); }
    throw new Error("The backup did not fit in device storage. Previous values were restored.");
  }
}
