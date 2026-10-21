// An estimate of drill performance, separate from participation XP.
export const SKILLS = ['logic', 'strategy', 'rhetoric', 'speed', 'analysis'];
const DAY = 86400000;
const WEIGHTS = { easy: 25, medium: 35, hard: 40 };
export function masteryScores(records = {}, now = Date.now()) {
  const scores = Object.fromEntries(SKILLS.map(key => [key, 0]));
  for (const skill of SKILLS) {
    for (const [difficulty, weight] of Object.entries(WEIGHTS)) {
      const items = Object.values(records).filter(r => r?.skill === skill && r.difficulty === difficulty && Number.isFinite(r.at) && r.at <= now);
      // Four distinct questions are needed for full coverage at each level.
      const coverage = Math.min(1, items.length / 4);
      const earned = items.reduce((sum, r) => {
        const age = (now - r.at) / DAY;
        const freshness = Math.max(0.5, 1 - Math.max(0, age - 30) / 120);
        return sum + (r.correct === true ? freshness : 0);
      }, 0);
      scores[skill] += items.length ? weight * coverage * earned / items.length : 0;
    }
    scores[skill] = Math.round(scores[skill]);
  }
  return scores;
}
export function recordAssessment(records, skill, answers, now = Date.now()) {
  const next = { ...records };
  let assessed = 0;
  for (const answer of answers) {
    if (!answer.id || !WEIGHTS[answer.difficulty] || !SKILLS.includes(skill)) continue;
    const key = `${skill}:${answer.id}`;
    const previous = next[key];
    // Immediate retries are practice; reassess the same item after seven days.
    if (previous && now - previous.at < 7 * DAY) continue;
    next[key] = { skill, difficulty: answer.difficulty, correct: answer.correct === true, at: now };
    assessed++;
  }
  return { records: next, scores: masteryScores(next, now), assessed };
}
export function prioritizeAssessment(pool, skill, records = {}, now = Date.now()) {
  return [...pool].sort((a, b) => {
    const rank = q => {
      const record = records[`${skill}:${q.id}`];
      return !record ? 0 : now - record.at >= 7 * DAY ? 1 : 2;
    };
    return rank(a) - rank(b);
  });
}
