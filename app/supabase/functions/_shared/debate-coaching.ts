export interface DebateCoaching {
  clarity?: string;
  persuasion?: string;
  strongestMoment?: { turn: number; feedback: string } | null;
  mostImportantImprovement?: string;
}

function readFeedback(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  return value.trim().slice(0, 600) || undefined;
}

export function readDebateCoaching(value: unknown, userTurnCount: number): DebateCoaching | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const fields = value as Record<string, unknown>;
  const coaching: DebateCoaching = {};
  const keys = ["clarity", "persuasion", "mostImportantImprovement"] as const;
  for (const key of keys) {
    const feedback = readFeedback(fields[key]);
    if (feedback) coaching[key] = feedback;
  }

  const moment = fields.strongestMoment;
  if (moment === null) coaching.strongestMoment = null;
  else if (moment && typeof moment === "object") {
    const { turn, feedback } = moment as Record<string, unknown>;
    const note = readFeedback(feedback);
    if (typeof turn === "number" && Number.isInteger(turn) && turn >= 1 && turn <= userTurnCount && note) {
      coaching.strongestMoment = { turn, feedback: note };
    }
  }

  return Object.keys(coaching).length ? coaching : undefined;
}
