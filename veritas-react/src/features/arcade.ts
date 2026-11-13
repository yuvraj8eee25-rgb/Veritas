export type ArcadeQuest = { id: string; goal: number; xp: number; text: string; track: (run: ArcadeRun) => number; best?: boolean };
export type ArcadeRun = { modeKey: string; correct: number; accuracy: number; bestCombo: number; score: number; isDaily: boolean };

export const achievementDefinitions = [
  { id: "first", name: "First Blood", description: "Finish your first run." },
  { id: "runs10", name: "Regular", description: "Finish 10 runs." },
  { id: "runs50", name: "Veteran", description: "Finish 50 runs." },
  { id: "flawless", name: "Flawless", description: "Finish a run with no mistakes." },
  { id: "chain10", name: "Ten in a Row", description: "Build a 10-answer chain." },
  { id: "chain20", name: "Twenty Straight", description: "Build a 20-answer chain." },
  { id: "xp1k", name: "Four Figures", description: "Bank 1,000 XP." },
  { id: "xp5k", name: "Five Thousand", description: "Bank 5,000 XP." },
  { id: "streak3", name: "Three Days", description: "Play 3 days running." },
  { id: "streak7", name: "Full Week", description: "Play 7 days running." },
  { id: "streak30", name: "A Month of It", description: "Play 30 days running." },
  { id: "allmodes", name: "All-Rounder", description: "Play every training mode." },
  { id: "quests1", name: "Goal-Getter", description: "Clear all 3 goals in a day." },
  { id: "score300", name: "High Score", description: "Score 300 in a single run." },
];

const questPool: ArcadeQuest[] = [
  { id: "runs3", goal: 3, xp: 60, text: "Finish 3 training runs", track: () => 1 },
  { id: "correct15", goal: 15, xp: 70, text: "Answer 15 questions correctly", track: run => run.correct },
  { id: "chain5", goal: 5, xp: 50, text: "Build a 5-answer chain", track: run => run.bestCombo, best: true },
  { id: "acc80", goal: 1, xp: 60, text: "Finish a run at 80% or better", track: run => run.accuracy >= 80 ? 1 : 0 },
  { id: "modes2", goal: 2, xp: 50, text: "Play 2 different modes", track: () => 0 },
  { id: "flawless", goal: 1, xp: 100, text: "Finish a run with no mistakes", track: run => run.accuracy === 100 ? 1 : 0 },
  { id: "daily", goal: 1, xp: 80, text: "Clear the Daily Challenge", track: run => run.isDaily ? 1 : 0 },
  { id: "score200", goal: 200, xp: 60, text: "Score 200 in a single run", track: run => run.score, best: true },
];

function seedFrom(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function dailyQuestDefinitions(date: string) {
  let seed = seedFrom(date);
  const pool = [...questPool];
  const chosen: ArcadeQuest[] = [];
  while (chosen.length < 3 && pool.length) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    chosen.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return chosen;
}

export function applyArcadeRun<T extends Record<string, any>>(state: T, date: string, run: ArcadeRun) {
  const oldQuestState = state.quests?.date === date ? state.quests : { date, prog: {}, done: [], modes: [] };
  const quests = {
    date,
    prog: { ...(oldQuestState.prog || {}) } as Record<string, number>,
    done: [...(oldQuestState.done || [])] as string[],
    modes: [...new Set([...(oldQuestState.modes || []), run.modeKey])] as string[],
  };
  const completed: ArcadeQuest[] = [];
  for (const quest of dailyQuestDefinitions(date)) {
    if (quests.done.includes(quest.id)) continue;
    const current = quests.prog[quest.id] || 0;
    const amount = quest.id === "modes2" ? quests.modes.length : quest.track(run);
    const next = quest.best ? Math.max(current, amount) : current + amount;
    quests.prog[quest.id] = next;
    if (next >= quest.goal) {
      quests.done.push(quest.id);
      completed.push(quest);
    }
  }

  const bonusXp = completed.reduce((total, quest) => total + quest.xp, 0);
  const nextState: Record<string, any> = { ...state, quests, totalXp: (Number(state.totalXp) || 0) + bonusXp };
  const unlocked: string[] = Array.isArray(state.achievements) ? [...state.achievements] : [];
  const unlock = (id: string, condition: boolean) => {
    if (condition && !unlocked.includes(id)) unlocked.push(id);
  };
  unlock("first", nextState.totalRuns >= 1);
  unlock("runs10", nextState.totalRuns >= 10);
  unlock("runs50", nextState.totalRuns >= 50);
  unlock("flawless", run.accuracy === 100);
  unlock("chain10", nextState.bestCombo >= 10);
  unlock("chain20", nextState.bestCombo >= 20);
  unlock("xp1k", nextState.totalXp >= 1000);
  unlock("xp5k", nextState.totalXp >= 5000);
  unlock("streak3", nextState.streak >= 3);
  unlock("streak7", nextState.streak >= 7);
  unlock("streak30", nextState.streak >= 30);
  unlock("allmodes", Object.keys(nextState.modeStats || {}).length >= 4);
  unlock("quests1", quests.done.length >= 3);
  unlock("score300", run.score >= 300);
  nextState.achievements = unlocked;

  return { state: nextState, completed, unlocked: unlocked.filter(id => !(state.achievements || []).includes(id)) };
}
