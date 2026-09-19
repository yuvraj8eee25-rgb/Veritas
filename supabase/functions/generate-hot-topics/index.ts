// =========================================================
// VERITAS — generate-hot-topics (Supabase Edge Function)
//
// Pulls real, current headlines from NewsAPI.org, then asks
// Gemini to turn a handful of them into one-sentence debatable
// claims. Upserts the result into hot_topics/{today}; the client
// just reads that row — no function call at read time.
//
// If NEWSAPI_KEY is missing or the NewsAPI call fails for any
// reason, this falls back to Gemini generating topics from its
// own knowledge (the original behavior), so the lobby never
// breaks because of a news-API hiccup.
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
//   NEWSAPI_KEY      — your NewsAPI.org API key (https://newsapi.org)
//   CRON_SECRET      — any random string, shared with the pg_cron job
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_MODEL = "gemini-3.1-flash-lite";
const CRON_SECRET = Deno.env.get("CRON_SECRET");
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
const NEWSAPI_KEY = Deno.env.get("NEWSAPI_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// NewsAPI.org categories we sample from, so the day's topics aren't
// all politics or all tech. One request per category (top-headlines
// doesn't support mixing categories in a single call).
const NEWS_CATEGORIES = ["technology", "business", "science", "health"];
const NEWS_COUNTRY = "us";

interface Headline {
  title: string;
  url: string;
  source: string;
  category: string;
}

interface Topic {
  text: string;
  tag: string;
  newsUrl?: string;
  newsSource?: string;
}

/* ---------------------------------------------------------
   1. Pull real headlines from NewsAPI.org
   --------------------------------------------------------- */

async function fetchHeadlinesFromNewsAPI(): Promise<Headline[]> {
  if (!NEWSAPI_KEY) throw new Error("NEWSAPI_KEY not set");

  const requests = NEWS_CATEGORIES.map(async (category) => {
    const url = `https://newsapi.org/v2/top-headlines?country=${NEWS_COUNTRY}&category=${category}&pageSize=6`;
    const res = await fetch(url, { headers: { "X-Api-Key": NEWSAPI_KEY } });
    if (!res.ok) {
      console.warn(`NewsAPI category "${category}" failed: ${res.status}`);
      return [] as Headline[];
    }
    const data = await res.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];
    return articles
      .filter((a: any) => a && a.title && a.title !== "[Removed]")
      .map((a: any): Headline => ({
        title: String(a.title).replace(/\s*-\s*[^-]+$/, "").trim(), // strip trailing " - Source Name"
        url: a.url,
        source: a.source?.name || "News",
        category,
      }));
  });

  const results = await Promise.all(requests);
  const headlines = results.flat();
  if (headlines.length === 0) throw new Error("NewsAPI returned no usable headlines");
  return headlines;
}

/* ---------------------------------------------------------
   2. Ground Gemini's topic generation in those headlines
   --------------------------------------------------------- */

function buildPrompt(headlines: Headline[] | null): string {
  if (!headlines || headlines.length === 0) {
    // Fallback prompt: no real news available, ask Gemini to use its own judgment.
    return `You write prompts for a debate-practice app. Give me 6 topics people
are actually discussing and disagreeing about right now (current events, tech, culture,
policy, science) — the kind of thing that would spark a genuine 1v1 debate between two
strangers today. Keep each topic to one sentence, phrased as a debatable claim or question,
suitable for a general audience. Vary the categories.

Respond with ONLY a JSON array, no prose, no markdown fences, in exactly this shape:
[{"text": "...", "tag": "..."}, ...]
"tag" is a short one-or-two word category label (e.g. "Tech", "Policy", "Culture").`;
  }

  const list = headlines
    .slice(0, 24)
    .map((h, i) => `${i + 1}. [${h.category}] ${h.title} (source: ${h.source})`)
    .join("\n");

  return `Here are today's real news headlines:
${list}

You write prompts for a debate-practice app. Pick 6 of the headlines above that would make
for a genuinely two-sided, debate-worthy claim, and turn each into ONE sentence phrased as
a debatable claim or question a general audience could argue either side of. Don't just
restate the headline — frame it as something two strangers could take opposite sides on.
Vary the categories you pick from. Skip headlines that are pure tragedy/breaking-news
reporting with no real "other side" (e.g. disasters, deaths) — pick the ones with genuine
disagreement potential (policy, tech ethics, business decisions, health guidance, etc).

Respond with ONLY a JSON array, no prose, no markdown fences, in exactly this shape:
[{"text": "...", "tag": "...", "headlineIndex": N}, ...]
"tag" is a short one-or-two word category label (e.g. "Tech", "Policy", "Culture").
"headlineIndex" is the number (1-${headlines.length}) of the headline this topic is based on.`;
}

async function fetchTopicsFromGemini(headlines: Headline[] | null): Promise<Topic[]> {
  const prompt = buildPrompt(headlines);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1000 },
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
  const rawTopics = JSON.parse(cleaned);

  if (!Array.isArray(rawTopics) || rawTopics.length === 0) {
    throw new Error("Gemini returned an empty or invalid topic list");
  }

  return rawTopics
    .filter((t: any) => t && typeof t.text === "string")
    .slice(0, 8)
    .map((t: any): Topic => {
      const idx = typeof t.headlineIndex === "number" ? t.headlineIndex - 1 : -1;
      const source = headlines && headlines[idx] ? headlines[idx] : null;
      return {
        text: t.text.trim(),
        tag: (t.tag || "Topic").trim(),
        ...(source ? { newsUrl: source.url, newsSource: source.source } : {}),
      };
    });
}

function todayKeyUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD, matches client's todayStr()
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    let headlines: Headline[] | null = null;
    let usedNews = false;
    try {
      headlines = await fetchHeadlinesFromNewsAPI();
      usedNews = true;
    } catch (newsErr) {
      console.warn("NewsAPI unavailable, falling back to Gemini-only topics:", newsErr);
    }

    const topics = await fetchTopicsFromGemini(headlines);
    const dateKey = todayKeyUTC();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from("hot_topics")
      .upsert({
        date: dateKey,
        topics,
        generated_at: new Date().toISOString(),
        source: usedNews ? "news+gemini" : "gemini",
      });

    if (error) throw error;

    console.log(`Hot topics generated for ${dateKey}: ${topics.length} topics (news: ${usedNews})`);
    return new Response(JSON.stringify({ ok: true, dateKey, count: topics.length, usedNews }), {
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
