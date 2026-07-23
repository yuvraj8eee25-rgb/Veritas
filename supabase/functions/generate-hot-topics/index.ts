// =========================================================
// VERITAS — generate-hot-topics (Supabase Edge Function)
//
// Replaces the Firebase generateHotTopics/generateHotTopicsNow
// Cloud Functions. Asks Gemini for today's debate-worthy topics
// and upserts them into hot_topics/{today}. The client reads
// that row directly — no function call needed at read time.
//
// Invoked on a schedule by a pg_cron job (see
// supabase/migrations/0001_init.sql) and can also be called
// manually to backfill/test:
//
//   curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/generate-hot-topics \
//     -H "x-cron-secret: <CRON_SECRET>"
//
// Secrets needed (set with `supabase secrets set NAME=value`):
//   GEMINI_API_KEY   — your Gemini API key
//   CRON_SECRET      — any random string, shared with the pg_cron job
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-2.0-flash";
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const TOPIC_PROMPT = `You write prompts for a debate-practice app. Give me 6 topics people
are actually discussing and disagreeing about right now (current events, tech, culture,
policy, science) — the kind of thing that would spark a genuine 1v1 debate between two
strangers today. Keep each topic to one sentence, phrased as a debatable claim or question,
suitable for a general audience. Vary the categories.

Respond with ONLY a JSON array, no prose, no markdown fences, in exactly this shape:
[{"text": "...", "tag": "..."}, ...]
"tag" is a short one-or-two word category label (e.g. "Tech", "Policy", "Culture").`;

interface Topic {
  text: string;
  tag: string;
}

async function fetchTopicsFromGemini(): Promise<Topic[]> {
  const response = await fetch(
    `https://gemini.googleapis.com/v1/models/${GEMINI_MODEL}:generateText`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        prompt: { text: TOPIC_PROMPT },
        temperature: 0.7,
        maxOutputTokens: 800,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini request failed: ${response.status} ${response.statusText} - ${errorBody}`);
  }

  const payload = await response.json();
  const raw =
    payload?.candidates?.[0]?.output ||
    payload?.candidates?.[0]?.content?.[0]?.text ||
    payload?.response?.output ||
    "";

  const cleaned = raw.replace(/^```json\s*|^```\s*|```$/gm, "").trim();
  const topics = JSON.parse(cleaned);

  if (!Array.isArray(topics) || topics.length === 0) {
    throw new Error("Gemini returned an empty or invalid topic list");
  }
  return topics
    .filter((t: any) => t && typeof t.text === "string")
    .slice(0, 8)
    .map((t: any) => ({ text: t.text.trim(), tag: (t.tag || "Topic").trim() }));
}

function todayKeyUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches client's todayStr()
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const topics = await fetchTopicsFromGemini();
    const dateKey = todayKeyUTC();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from("hot_topics")
      .upsert({ date: dateKey, topics, generated_at: new Date().toISOString(), source: "gemini" });

    if (error) throw error;

    console.log(`Hot topics generated for ${dateKey}: ${topics.length} topics`);
    return new Response(JSON.stringify({ ok: true, dateKey, count: topics.length }), {
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
