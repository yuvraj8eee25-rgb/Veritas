// Trusted Classroom service boundary. Configure EMAIL_PROVIDER_URL and
// EMAIL_PROVIDER_KEY as Supabase Edge Function secrets before enabling email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { guardUserRequest, withCors } from "../_shared/http.ts";

const cors = { "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(withCors(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return json({ error: "Classroom service is not configured." }, 503);
  const auth = request.headers.get("Authorization");
  if (!auth) return json({ error: "Sign in to use Classroom services." }, 401);
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return json({ error: "Your session has expired. Sign in again." }, 401);
  const payload = await request.json().catch(() => null);
  if (!payload || !["email"].includes(payload.action)) return json({ error: "Unsupported Classroom service action." }, 400);
  if (payload.action === "email") {
    const guarded = await guardUserRequest(request, "classroom-email", 20, 3600);
    if (guarded) return guarded;
    const provider = Deno.env.get("EMAIL_PROVIDER_URL");
    const key = Deno.env.get("EMAIL_PROVIDER_KEY");
    const from = Deno.env.get("EMAIL_FROM");
    if (!provider || !key || !from) return json({ error: `Email delivery is not configured. Missing: ${[!provider && "EMAIL_PROVIDER_URL", !key && "EMAIL_PROVIDER_KEY", !from && "EMAIL_FROM"].filter(Boolean).join(", ")}.` }, 503);
    const token = String(payload.token || "");
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Invalid invitation token." }, 400);
    const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((origin) => origin.trim()).filter(Boolean);
    let inviteUrl: URL;
    try { inviteUrl = new URL(String(payload.url || "")); } catch { return json({ error: "Invalid invitation URL." }, 400); }
    if (!allowedOrigins.includes(inviteUrl.origin) || inviteUrl.protocol !== "https:" && inviteUrl.hostname !== "localhost" && inviteUrl.hostname !== "127.0.0.1") return json({ error: "Invitation URL must use an approved website origin." }, 400);
    if (inviteUrl.searchParams.get("classroom_invite") !== token) return json({ error: "Invitation URL does not match this invitation." }, 400);
    const { data: recipient, error: rpcError } = await client.rpc("validate_classroom_invite_email", { p_invite_id: payload.invite, p_token: token });
    if (rpcError || !recipient) return json({ error: "Invitation not found, expired, already used, or unavailable to this coach." }, 404);
    const response = await fetch(provider, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}`, "Idempotency-Key": `veritas-classroom-invite-${payload.invite}` }, body: JSON.stringify({ from, to: recipient, subject: "Your Veritas Classroom invitation", text: `Join your Veritas cohort with this link: ${inviteUrl.href}` }), signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      console.warn(JSON.stringify({ event: "classroom_email_provider_error", status: response.status }));
      return json({ error: "Email delivery failed. Copy and share the invitation link instead." }, 502);
    }
    return json({ ok: true });
  }
  return json({ error: "Unsupported Classroom service action." }, 400);
}));
