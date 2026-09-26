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

const EXA_API_KEY = Deno.env.get("EXA_API_KEY");

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

Deno.serve(withCors(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
  const guarded = await guardUserRequest(req, "exa-search", 15, 600);
  if (guarded) return guarded;

  if (!EXA_API_KEY) {
    console.error("EXA_API_KEY secret is not set");
    return json({ ok: false, error: "Search is not configured" }, 500);
  }

  let query = "";
  try {
    const body = await req.json();
    query = String(body?.query ?? "").trim().slice(0, MAX_QUERY_CHARS);
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }
  if (!query) return json({ ok: false, error: "query is required" }, 400);

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "x-api-key": EXA_API_KEY, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        query,
        numResults: NUM_RESULTS,
        contents: { text: { maxCharacters: MAX_TEXT_CHARS } },
      }),
    });

    if (!res.ok) {
      console.warn(JSON.stringify({ event: "exa_provider_error", status: res.status }));
      return json({ ok: false, error: `Search provider error (${res.status})` }, 502);
    }

    const payload = await res.json();
    const results = Array.isArray(payload?.results)
      ? payload.results.map((r: Record<string, unknown>) => ({
          title: r.title ?? null,
          url: r.url ?? null,
          text: r.text ?? "",
          publishedDate: r.publishedDate ?? null,
        }))
      : [];

    return json({ ok: true, results });
  } catch (err) {
    console.error(JSON.stringify({ event: "exa_request_failed", name: err instanceof Error ? err.name : "Error" }));
    return json({ ok: false, error: "Search request failed" }, 500);
  }
}));
