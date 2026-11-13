import { supabaseFunctionTimeouts } from "../../../lib/supabase-function-timeouts";

const ALLOWED_FUNCTIONS = new Set(["assess-evidence", "exa-search", "ai-debate", "classroom-service"]);

export const dynamic = "force-dynamic";

function routeError(message: string, status: number, requestId: string) {
  return Response.json({ error: message, request_id: requestId }, {
    status,
    headers: { "Cache-Control": "no-store", "x-request-id": requestId },
  });
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 80) || crypto.randomUUID();
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return routeError("Sign in to use this feature.", 401, requestId);
  }

  let input: { functionName?: unknown; body?: unknown };
  try {
    input = await request.json();
  } catch {
    return routeError("Invalid request body.", 400, requestId);
  }

  if (typeof input.functionName !== "string" || !ALLOWED_FUNCTIONS.has(input.functionName)) {
    return routeError("Unsupported Supabase function.", 400, requestId);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    return routeError("Supabase is not configured.", 503, requestId);
  }

  const { proxy: timeout } = supabaseFunctionTimeouts(input.functionName, input.body);
  try {
    const upstream = await fetch(
      `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${input.functionName}`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: authorization,
          "Content-Type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify(input.body ?? {}),
        cache: "no-store",
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]),
      },
    );

    const responseBody = await upstream.text();
    return new Response(responseBody, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
        "x-request-id": upstream.headers.get("x-request-id") ?? requestId,
        ...(upstream.headers.get("Retry-After") ? { "Retry-After": upstream.headers.get("Retry-After")! } : {}),
      },
    });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "TimeoutError") {
      return routeError(`The Supabase function timed out after ${timeout / 1000} seconds.`, 504, requestId);
    }
    return routeError("Could not reach the Supabase function. Check the project's Supabase URL and network access.", 502, requestId);
  }
}
