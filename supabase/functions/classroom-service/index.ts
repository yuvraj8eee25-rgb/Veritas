// Trusted Classroom service boundary. Configure EMAIL_PROVIDER_URL and
// EMAIL_PROVIDER_KEY as Supabase Edge Function secrets before enabling email.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (request) => {
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
    const provider = Deno.env.get("EMAIL_PROVIDER_URL");
    const key = Deno.env.get("EMAIL_PROVIDER_KEY");
    const from = Deno.env.get("EMAIL_FROM");
    if (!provider || !key || !from) return json({ error: `Email delivery is not configured. Missing: ${[!provider && "EMAIL_PROVIDER_URL", !key && "EMAIL_PROVIDER_KEY", !from && "EMAIL_FROM"].filter(Boolean).join(", ")}.` }, 503);
    const token = String(payload.token || "");
    if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: "Invalid invitation token." }, 400);
    const { data, error: rpcError } = await client.rpc("classroom_command", { p_action: "workspace", p_data: {} });
    if (rpcError || !data) return json({ error: "Unable to verify invitation." }, 403);
    const invite = (data.invites || []).find((row: { id: string }) => row.id === payload.invite);
    if (!invite) return json({ error: "Invitation not found or you are not its coach." }, 404);
    const response = await fetch(provider, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ from, to: invite.invited_email, subject: "Your Veritas Classroom invitation", text: `Join your Veritas cohort with this link: ${payload.url || ""}` }) });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return json({ error: `Email provider rejected the message${detail ? `: ${detail.slice(0, 500)}` : "."} Copy the invite link instead.` }, 502);
    }
    return json({ ok: true });
  }
  return json({ error: "Unsupported Classroom service action." }, 400);
});
