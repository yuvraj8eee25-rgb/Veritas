const ALLOWED_HEADERS = "authorization, x-client-info, apikey, content-type, x-request-id";

export function withCors(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id")?.slice(0, 80) || crypto.randomUUID();
    const origin = request.headers.get("Origin");
    const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "")
      .split(",").map((entry) => entry.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) {
      console.warn(JSON.stringify({ requestId, event: "origin_rejected" }));
      return new Response(JSON.stringify({ error: "This website is not allowed to access Veritas services." }), {
        status: 403,
        headers: { "Content-Type": "application/json", "Vary": "Origin", "x-request-id": requestId },
      });
    }
    const cors: Record<string, string> = {
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Expose-Headers": "x-request-id, Retry-After",
      "Vary": "Origin",
      "x-request-id": requestId,
    };
    if (origin) cors["Access-Control-Allow-Origin"] = origin;
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let response: Response;
    try {
      response = await handler(request);
    } catch (error) {
      console.error(JSON.stringify({ requestId, event: "unhandled_error", name: error instanceof Error ? error.name : "Error" }));
      response = new Response(JSON.stringify({ error: "The service could not complete this request.", requestId }), { status: 500 });
    }
    console.info(JSON.stringify({ requestId, event: "request_complete", status: response.status }));
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    headers.set("x-request-id", requestId);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

export function requestId(request: Request): string {
  return request.headers.get("x-request-id")?.slice(0, 80) || crypto.randomUUID();
}

export async function guardUserRequest(request: Request, action: string, limit: number, windowSeconds: number): Promise<Response | null> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization = request.headers.get("Authorization") || "";
  const request_id = requestId(request);
  if (!url || !anon || !serviceRole) return new Response(JSON.stringify({ error: "Request protection is not configured.", request_id }), { status: 503 });
  if (!authorization.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Sign in required.", request_id }), { status: 401 });
  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) return new Response(JSON.stringify({ error: "Your session has expired. Sign in again.", request_id }), { status: 401 });
  const serviceClient = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error: quotaError } = await serviceClient.rpc("consume_veritas_quota", {
    p_user_id: user.id, p_action: action, p_limit: limit, p_window_seconds: windowSeconds,
  });
  if (quotaError) return new Response(JSON.stringify({ error: "Request protection is temporarily unavailable.", request_id }), { status: 503 });
  if (!data) return new Response(JSON.stringify({ error: "You are making requests too quickly. Please wait and try again.", request_id }), { status: 429, headers: { "Retry-After": String(windowSeconds) } });
  return null;
}
