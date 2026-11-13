// =========================================================
// VERITAS — exa-search (Supabase Edge Function)
//
// Server-side proxy for Exa.ai search, used by the agentic
// fact-checker (agentic-investigation.js). Exists so the Exa API
// key lives in Supabase secrets and never ships to the browser.
//
// Called from the client via:
//   supabase.functions.invoke("exa-search", { body: { query } })
//
// Requires a signed-in user (the client attaches the session JWT
// automatically). Anonymous callers get 401.
//
// Secrets needed (set with `supabase secrets set NAME=value`):
//   EXA_API_KEY — a NEW key (the old one was committed to the repo
//                 and must be revoked in the Exa dashboard)
//
// Manual test (replace <USER_JWT> with a signed-in user's access token):
//   curl -X POST https://<PROJECT_REF>.supabase.co/functions/v1/exa-search \
//     -H "Content-Type: application/json" \
//     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <USER_JWT>" \
//     -d '{"query":"effects of social media bans on teen mental health"}'
// =========================================================

import { guardUserRequest, withCors } from "../_shared/http.ts";
import { object, safeSourceUrl, terms, VERIFICATION_VERSION } from "../_shared/evidence-verification.ts";

const EXA_API_KEY = Deno.env.get("EXA_API_KEY");
const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY");

const MAX_QUERY_CHARS = 300;
const NUM_RESULTS = 4;
const MAX_TEXT_CHARS = 1600;

const CORS_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function relevantExcerpt(raw: string, query: string) {
  if (raw.length <= MAX_TEXT_CHARS) return raw;
  const keywords = terms(query);
  // Compare overlapping windows so relevant passages after navigation or a long introduction
  // have a chance to reach the assessor. Return a contiguous slice of the original text.
  const text = raw.slice(0, 100_000);
  let best = text.slice(0, MAX_TEXT_CHARS);
  let bestScore = -1;
  for (let offset = 0; offset < text.length; offset += 800) {
    const window = text.slice(offset, offset + MAX_TEXT_CHARS);
    const start = offset ? window.search(/\s/) + 1 : 0;
    const end = offset + window.length < text.length ? Math.max(window.lastIndexOf(" "), window.lastIndexOf("\n")) : window.length;
    const excerpt = window.slice(start, end > start ? end : window.length);
    const words = terms(excerpt);
    const score = [...keywords].filter(term => words.has(term)).length;
    if (score > bestScore) {
      bestScore = score;
      best = excerpt;
    }
  }
  return best;
}

async function searchTavily(query: string, key: string) {
  const indianLaw = /\bindia(?:n)?\b/i.test(query) &&
    /\b(?:law|legal|constitution\w*|right[s]?|judg(?:e)?ment[s]?|court|statute)\b/i.test(query);
  const officialDomains = ["indiacode.nic.in", "legislative.gov.in", "sci.gov.in", "ecourts.gov.in", "calcuttahighcourt.gov.in"];
  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(18_000),
    body: JSON.stringify({
      query: query.slice(0, 400), max_results: NUM_RESULTS, search_depth: "basic",
      include_answer: false, include_raw_content: "text",
      ...(indianLaw ? { include_domains: officialDomains } : {}),
    }),
  });
  if (!response.ok) {
    console.warn(JSON.stringify({ event: "tavily_provider_error", status: response.status }));
    return json({ ok: false, error: `Tavily search returned status ${response.status}.` }, 502);
  }
  const payload = object(await response.json());
  if (!Array.isArray(payload?.results)) return json({ ok: false, error: "Tavily returned an invalid search response." }, 502);
  const results = payload.results.slice(0, NUM_RESULTS).flatMap(value => {
    const item = object(value);
    if (!item || !safeSourceUrl(item.url)) return [];
    const raw = typeof item.raw_content === "string" ? item.raw_content.trim() : "";
    return [{
      url: item.url, title: item.title, text: relevantExcerpt(raw, query),
      publishedDate: item.published_date ?? null, author: null, links: [],
    }];
  });
  return json({ ok: true, provider: "tavily", results });
}

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const guarded = await guardUserRequest(req, "exa-search", 15, 600);
  if (guarded) return guarded;

  let query = "";
  let verification = false;
  let useTavily = false;
  try {
    const body = await req.json();
    verification = body?.version === VERIFICATION_VERSION;
    useTavily = verification && body?.provider === "tavily" && Boolean(TAVILY_API_KEY);
    query = String(body?.query ?? "").trim().slice(0, verification ? 560 : MAX_QUERY_CHARS);
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  if (!query) return json({ ok: false, error: "query is required" }, 400);

  try {
    if (useTavily && TAVILY_API_KEY) return await searchTavily(query, TAVILY_API_KEY);
    if (!EXA_API_KEY) return json({ ok: false, error: "Search is not configured" }, 500);
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": EXA_API_KEY, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        query,
        numResults: NUM_RESULTS,
        contents: {
          text: { maxCharacters: MAX_TEXT_CHARS },
          ...(verification ? { extras: { links: 30 } } : {}),
        },
      }),
    });

    if (!res.ok) {
      console.warn(JSON.stringify({ event: "exa_provider_error", status: res.status }));
      return json({ ok: false, error: `Search provider error (${res.status})` }, 502);
    }

    const payload = await res.json();
    if (verification && !Array.isArray(payload?.results)) {
      return json({ ok: false, error: "Search provider returned an invalid response" }, 502);
    }
    const results = Array.isArray(payload?.results)
      ? payload.results.filter((r: unknown) => r && typeof r === "object").map((r: Record<string, unknown>) => ({
          title: r.title ?? null,
          url: r.url ?? null,
          text: r.text ?? "",
          publishedDate: r.publishedDate ?? null,
          author: typeof r.author === "string" ? r.author.trim().slice(0, 200) || null : null,
          ...(verification ? { links: Array.isArray((r.extras as { links?: unknown })?.links)
            ? (r.extras as { links: unknown[] }).links.filter(link => typeof link === "string").slice(0, 30) : [] } : {}),
        }))
      : [];

    return json({ ok: true, ...(verification ? { provider: "exa" } : {}), results });
  } catch (err) {
    const provider = useTavily ? "Tavily" : "Exa";
    console.error(JSON.stringify({ event: "search_request_failed", provider, name: err instanceof Error ? err.name : "Error" }));
    return json({ ok: false, error: `${provider} search request failed.` }, 502);
  }
}));
