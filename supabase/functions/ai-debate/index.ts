// =========================================================
// VERITAS — ai-debate (Supabase Edge Function)
//
// Powers the solo "Debate the AI" mode: the player picks any
// topic (hot topic or their own) and argues it turn-by-turn
// against a generated AI opponent, called directly from the
// client (ai-debate.js) via supabase.functions.invoke("ai-debate", ...).
// Unlike ai-referee (multiplayer), there's no debates table row
// to react to — everything is synchronous request/response, and
// nothing is persisted server-side.
//
// Three actions, chosen by body.action:
//   "opponent" — generate the AI's next rebuttal in the debate
//   "referee"  — score the finished debate AND pick the single
//                strongest point the player never made, turning
//                it into a one-turn "Devil's Advocate Drill"
//                follow-up challenge (uses the same per-turn
//                reasoning the model already produces for the
//                verdict, just surfaced instead of thrown away)
//   "drill"    — score the player's answer to that drill
//
// Manual test:
//   curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/ai-debate \
//     -H "Content-Type: application/json" -H "apikey: <ANON_KEY>" \
//     -d '{"action":"opponent","topic":"Should schools ban homework?","transcript":[]}'
//
// Secrets needed (same key generate-hot-topics / ai-referee already use):
//   GEMINI_API_KEY
// =========================================================

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface TranscriptTurn {
  speaker: "user" | "ai";
  text: string;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function callGemini(prompt: string, maxTokens = 800): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens },
      }),
    },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }
  const payload = await response.json();
  const raw: string = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
}

function formatTranscript(transcript: TranscriptTurn[]): string {
  if (!transcript.length) return "(no turns yet)";
  return transcript
    .map((t, i) => `Turn ${i + 1} (${t.speaker === "user" ? "Debater" : "AI opponent"}): ${t.text}`)
    .join("\n\n");
}

/* ---------------------------------------------------------
   Action: opponent — generate the AI's next rebuttal
   --------------------------------------------------------- */

async function handleOpponent(body: any) {
  const topic = String(body.topic || "").trim();
  const transcript: TranscriptTurn[] = Array.isArray(body.transcript) ? body.transcript : [];
  const stance = body.aiStance === "for" ? "in favor of" : "against";

  const prompt = `You are a sharp, respectful debate opponent practicing with a human debater. Stay firmly ${stance} the topic below throughout the whole exchange. Respond with 2-4 sentences, direct and substantive — no preamble, no "As an AI", no meta-commentary. Engage with the debater's most recent point specifically instead of repeating a generic stance.

Topic: "${topic}"

Debate so far:
${formatTranscript(transcript)}

Write only your next rebuttal (plain text, no quotes, no labels).`;

  const text = await callGemini(prompt, 300);
  return json({ ok: true, text: text.replace(/^["']|["']$/g, "").trim() });
}

/* ---------------------------------------------------------
   Action: referee — score the finished debate + devil's advocate
   --------------------------------------------------------- */

async function handleReferee(body: any) {
  const topic = String(body.topic || "").trim();
  const transcript: TranscriptTurn[] = Array.isArray(body.transcript) ? body.transcript : [];
  const userTurnCount = transcript.filter((t) => t.speaker === "user").length;

  const prompt = `You are an impartial debate referee judging a short practice debate between a human debater ("Debater") and an AI opponent. Respond with raw JSON only — no prose, no markdown fences.

Topic: "${topic}"

Transcript:
${formatTranscript(transcript)}

Judge on strength of reasoning, use of evidence/examples, and how directly the Debater responded to the AI opponent's points — not writing polish.

Also identify the single strongest point supporting the Debater's overall side of the topic that the Debater never raised in their turns — a real gap in their case, not something they already said. Turn it into a one-turn practice drill: state that missed point clearly, and phrase a sharp challenge inviting the Debater to argue it now.

Respond with ONLY a JSON object, exactly this shape:
{
  "debaterScore": <integer 0-100>,
  "aiScore": <integer 0-100>,
  "winner": "debater" | "ai" | "tie",
  "summary": "<2-3 sentence verdict addressed directly to the Debater as 'you'>",
  "turnFeedback": [
    { "turn": <1-indexed turn number of a Debater turn only>, "logic": "<one short sentence>", "evidence": "<one short sentence>", "responsiveness": "<one short sentence>" }
  ],
  "devilsAdvocate": {
    "missedPoint": "<the strongest point for the Debater's side that they never made, 1-2 sentences>",
    "challenge": "<a short, direct sentence challenging the Debater to argue that point now>"
  }
}
Keep "turnFeedback" to one entry per Debater turn only (skip AI turns).`;

  const cleaned = await callGemini(prompt, 1300);
  const parsed = JSON.parse(cleaned);

  const debaterScore = Math.max(0, Math.min(100, Math.round(Number(parsed.debaterScore) || 0)));
  const aiScore = Math.max(0, Math.min(100, Math.round(Number(parsed.aiScore) || 0)));
  const winner = ["debater", "ai", "tie"].includes(parsed.winner) ? parsed.winner : "tie";

  const turnFeedback = Array.isArray(parsed.turnFeedback)
    ? parsed.turnFeedback
        .filter((f: any) => f && typeof f.turn === "number")
        .map((f: any) => ({
          turn: f.turn,
          logic: String(f.logic || "").trim(),
          evidence: String(f.evidence || "").trim(),
          responsiveness: String(f.responsiveness || "").trim(),
        }))
    : [];

  const da = parsed.devilsAdvocate || {};
  const devilsAdvocate = {
    missedPoint: String(da.missedPoint || "").trim(),
    challenge: String(da.challenge || "").trim(),
  };

  return json({
    ok: true,
    verdict: {
      debaterScore,
      aiScore,
      winner,
      summary: String(parsed.summary || "").trim() || "The referee scored the debate but didn't provide a summary.",
      turnFeedback,
      devilsAdvocate: devilsAdvocate.missedPoint ? devilsAdvocate : null,
      userTurnCount,
      model: GEMINI_MODEL,
    },
  });
}

/* ---------------------------------------------------------
   Action: drill — score the player's Devil's Advocate answer
   --------------------------------------------------------- */

async function handleDrill(body: any) {
  const topic = String(body.topic || "").trim();
  const missedPoint = String(body.missedPoint || "").trim();
  const rebuttal = String(body.rebuttal || "").trim();

  const prompt = `You are a debate coach running a one-turn "Devil's Advocate Drill". The Debater was challenged to argue a point they'd previously skipped. Respond with raw JSON only — no prose, no markdown fences.

Topic: "${topic}"
Point they were challenged to argue: "${missedPoint}"
Their attempt: "${rebuttal}"

Respond with ONLY a JSON object, exactly this shape:
{
  "score": <integer 0-100, how convincingly they argued the assigned point>,
  "feedback": "<2-3 sentences of direct, specific coaching feedback, addressed as 'you'>"
}`;

  const cleaned = await callGemini(prompt, 500);
  const parsed = JSON.parse(cleaned);
  const score = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
  const feedback = String(parsed.feedback || "").trim() || "Solid attempt — keep sharpening this angle.";

  return json({ ok: true, score, feedback });
}

/* ---------------------------------------------------------
   Entry point
   --------------------------------------------------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "POST only" }, 405);
  }
  if (!GEMINI_API_KEY) {
    return json({ ok: false, error: "GEMINI_API_KEY not configured" }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: "invalid JSON body" }, 400);
  }

  try {
    switch (body?.action) {
      case "opponent":
        return await handleOpponent(body);
      case "referee":
        return await handleReferee(body);
      case "drill":
        return await handleDrill(body);
      default:
        return json({ ok: false, error: "action must be one of: opponent, referee, drill" }, 400);
    }
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: String(err) }, 500);
  }
});
