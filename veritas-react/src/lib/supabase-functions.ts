import { auth } from "./supabase";

export type VeritasFunction = "assess-evidence" | "exa-search" | "ai-debate" | "classroom-service";

export class VeritasConnectionError extends Error {
  constructor(requestId: string) {
    super(`The connection to Veritas was interrupted. Reference: ${requestId}`);
    this.name = "VeritasConnectionError";
  }
}

export async function invokeVeritasFunction(functionName: VeritasFunction, body: Record<string, unknown>) {
  if (!auth) throw new Error("Connect Supabase before using this feature.");

  const { data, error } = await auth.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) throw new Error("Sign in to use this feature.");

  const requestId = globalThis.crypto?.randomUUID?.() || `veritas-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
  let response: Response;
  try {
    response = await fetch("/api/supabase-functions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({ functionName, body }),
      cache: "no-store",
    });
  } catch {
    throw new VeritasConnectionError(requestId);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof result?.error === "string" ? result.error : `Supabase function returned ${response.status}.`;
    const reference = typeof result?.request_id === "string" ? result.request_id : response.headers.get("x-request-id");
    throw new Error(reference ? `${message} Reference: ${reference}` : message);
  }
  return result;
}
