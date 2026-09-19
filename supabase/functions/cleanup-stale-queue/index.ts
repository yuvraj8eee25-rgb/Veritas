// =========================================================
// VERITAS — cleanup-stale-queue (Supabase Edge Function)
//
// Replaces the Firebase cleanupStaleQueue Cloud Function.
// Deletes matchmaking-queue rows from players who searched and
// then closed the app, so they don't get "found" hours later.
//
// Invoked every 5 minutes by a pg_cron job (see
// supabase/migrations/0001_init.sql).
//
// Secrets needed (set with `supabase secrets set NAME=value`):
//   CRON_SECRET — any random string, shared with the pg_cron job
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from("match_queue")
      .delete()
      .eq("status", "waiting")
      .lt("created_at", cutoff)
      .select("uid");

    if (error) throw error;

    const count = data?.length ?? 0;
    console.log(`Cleaned up ${count} stale queue entries`);
    return new Response(JSON.stringify({ ok: true, cleaned: count }), {
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
