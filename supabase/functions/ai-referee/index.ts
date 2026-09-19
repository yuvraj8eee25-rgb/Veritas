// =========================================================
// VERITAS — ai-referee (Supabase Edge Function)
//
// Replaces the client-side heuristic scorer with a real AI
// judgment call, via Gemini (same free-tier key/model already
// used by generate-hot-topics — no separate paid provider
// needed). Triggered by Postgres itself (see
// supabase/migrations/0002_ai_referee.sql) the instant a
// debate's status flips to 'completed' inside submit_turn() /
// submit_timeout_turn() — not by the client — so scoring still
// happens even if the player who ends the debate closes the
// tab right away.
//
// The client (multiplayer.js) is already subscribed to UPDATEs
// on the debates row, so once this function writes ai_verdict
// back, the end-of-debate screen upgrades from the instant
// heuristic estimate to the real verdict automatically.
//
// Manual test / backfill:
//   curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/ai-referee \
//     -H "Content-Type: application/json" \
//     -H "x-referee-secret: <AI_REFEREE_SECRET>" \
//     -d '{"debate_id": "<uuid>"}'
//
// Secrets needed (set with `supabase secrets set NAME=value`):
//   GEMINI_API_KEY      — same key generate-hot-topics already uses
//   AI_REFEREE_SECRET   — any random string, shared with the
//                         notify_ai_referee() call in the DB
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// Same free-tier model generate-hot-topics uses. Google's free-tier
// model names churn — if this starts failing, check
// https://ai.google.dev/gemini-api/docs/changelog for the current
// name before swapping it (same lesson as generate-hot-topics).
const GEMINI_MODEL = "gemini-3.1-flash-lite";

const AI_REFEREE_SECRET = Deno.env.get("AI_REFEREE_SECRET");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Turn {
  uid: string;
  text: string;
  ts: number;
}

interface DebateRow {
  id: string;
  topic: string;
  players: string[];
  player_order: string[];
  turns: Turn[];
  status: string;
  ai_verdict: unknown;
}

interface TurnFeedback {
  turnIndex: number;
  uid: string;
  logic: string;
  evidence: string;
  responsiveness: string;
}

interface Verdict {
  scores: Record<string, number>;
  winnerUid: string | null;
  summary: string;
  turnFeedback: TurnFeedback[];
  model: string;
}

/* ---------------------------------------------------------
   1. Build the prompt from the debate's turn history
   --------------------------------------------------------- */

function buildPrompt(debate: DebateRow): string {
  const [uidA, uidB] = debate.player_order;
  const transcript = debate.turns
    .map((t, i) => {
      const speaker = t.uid === uidA ? "Player A" : "Player B";
      return `Turn ${i + 1} (${speaker}): ${t.text}`;
    })
    .join("\n\n");

  return `You are an impartial debate referee judging a short 1v1 text debate between two strangers practicing their argumentation skills. Respond with raw JSON only — no prose, no markdown fences.

Topic: "${debate.topic}"

Transcript (players alternate turns, "⏳" turns mean that player timed out and passed):
${transcript}

Judge the debate on the strength of reasoning, use of evidence/examples, and how directly each player responded to their opponent's points — not on writing polish or who happened to go first. Timed-out ("⏳") turns should count against that player.

Respond with ONLY a JSON object, no prose, no markdown fences, in exactly this shape:
{
  "scoreA": <integer 0-100, Player A's score>,
  "scoreB": <integer 0-100, Player B's score>,
  "winner": "A" | "B" | "tie",
  "summary": "<2-3 sentence overall verdict, written for the players, addressing them as 'Player A' and 'Player B'>",
  "turnFeedback": [
    { "turn": <turn number, 1-indexed>, "logic": "<one short sentence>", "evidence": "<one short sentence>", "responsiveness": "<one short sentence>" },
    ...
  ]
}
Keep "turnFeedback" to one entry per turn, each field a single short sentence.`;
}

/* ---------------------------------------------------------
   2. Call Gemini
   --------------------------------------------------------- */

async function fetchVerdictFromGemini(debate: DebateRow): Promise<Verdict> {
  const prompt = buildPrompt(debate);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const payload = await response.json();
  const raw: string = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const cleaned = raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
  const parsed = JSON.parse(cleaned);

  const [uidA, uidB] = debate.player_order;
  const scoreA = Math.max(0, Math.min(100, Math.round(Number(parsed.scoreA) || 0)));
  const scoreB = Math.max(0, Math.min(100, Math.round(Number(parsed.scoreB) || 0)));

  let winnerUid: string | null = null;
  if (parsed.winner === "A") winnerUid = uidA;
  else if (parsed.winner === "B") winnerUid = uidB;

  const turnFeedback: TurnFeedback[] = Array.isArray(parsed.turnFeedback)
    ? parsed.turnFeedback
        .filter((f: any) => f && typeof f.turn === "number")
        .map((f: any): TurnFeedback => {
          const idx = f.turn - 1;
          const turn = debate.turns[idx];
          return {
            turnIndex: idx,
            uid: turn ? turn.uid : "",
            logic: String(f.logic || "").trim(),
            evidence: String(f.evidence || "").trim(),
            responsiveness: String(f.responsiveness || "").trim(),
          };
        })
    : [];

  return {
    scores: { [uidA]: scoreA, [uidB]: scoreB },
    winnerUid,
    summary: String(parsed.summary || "").trim() || "The referee scored the debate but didn't provide a summary.",
    turnFeedback,
    model: GEMINI_MODEL,
  };
}

/* ---------------------------------------------------------
   3. Entry point
   --------------------------------------------------------- */

Deno.serve(async (req) => {
  if (AI_REFEREE_SECRET && req.headers.get("x-referee-secret") !== AI_REFEREE_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  let debateId: string | undefined;
  try {
    const body = await req.json();
    debateId = body?.debate_id;
  } catch {
    // fall through, handled below
  }

  if (!debateId) {
    return new Response(JSON.stringify({ ok: false, error: "missing debate_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  try {
    const { data: debate, error: fetchError } = await supabase
      .from("debates")
      .select("id, topic, players, player_order, turns, status, ai_verdict")
      .eq("id", debateId)
      .single();

    if (fetchError || !debate) {
      throw new Error(`debate ${debateId} not found: ${fetchError?.message ?? "no row"}`);
    }
    if (debate.status !== "completed") {
      // Not an error — just means we were called too early (or the DB
      // trigger fired on a race). Nothing to score yet.
      return new Response(JSON.stringify({ ok: true, skipped: "not completed yet" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (debate.ai_verdict) {
      // Already scored (idempotency guard against duplicate triggers/retries).
      return new Response(JSON.stringify({ ok: true, skipped: "already scored" }), {
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!Array.isArray(debate.turns) || debate.turns.length === 0) {
      return new Response(JSON.stringify({ ok: true, skipped: "no turns to score" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const verdict = await fetchVerdictFromGemini(debate as DebateRow);

    const { error: updateError } = await supabase
      .from("debates")
      .update({ ai_verdict: verdict, ai_scored_at: new Date().toISOString() })
      .eq("id", debateId)
      .is("ai_verdict", null); // extra idempotency guard at the write itself

    if (updateError) throw updateError;

    console.log(`AI referee scored debate ${debateId}: ${JSON.stringify(verdict.scores)}`);
    return new Response(JSON.stringify({ ok: true, debateId, verdict }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
