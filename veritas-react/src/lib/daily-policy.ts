export function utcDay(timestamp = Date.now()) { return new Date(timestamp).toISOString().slice(0, 10); }
export function nextUtcReset(timestamp: number) {
  const next = new Date(timestamp); next.setUTCHours(24, 0, 0, 0); return next.getTime();
}
export function dailyRewardAvailable(completed: string | null | undefined, started: string) {
  return !completed || completed < started;
}
export function completedDailyDate(completed: string | null | undefined, started: string) {
  return completed && completed > started ? completed : started;
}
