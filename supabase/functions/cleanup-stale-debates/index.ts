// =========================================================
// VERITAS — cleanup-stale-debates (Supabase Edge Function)
//
// Fixes: if a player closes their tab mid-debate, their
// opponent is left staring at "Opponent's turn" forever. The
// per-turn timeout (submit_timeout_turn()) only ever fires from
// the browser of whoever currently owns the turn, so if that
// browser is gone, nothing was left to advance — or end — the
// debate.
//
// This function just calls the expire_stale_debates() Postgres
// function (see supabase/migrations/0003_stale_debate_cleanup.sql),
// which flips any 'active' debate with no turn in the last
// N minutes to 'completed' and fires the same AI-referee
// notification a normal completion does. The client already
// treats any non-'active' status as "debate over," so this is
// enough for the stuck opponent's screen to resolve on its own
// next realtime update — no front-end change needed.
//
// Same shape as cleanup-stale-queue: invoked every 5 minutes by
// a pg_cron job (see the scheduling block in
// supabase/migrations/0003_stale_debate_cleanup.sql).
//
// Secrets needed (set with `supabase secrets set NAME=value`):
//   CRON_SECRET — same value already used by cleanup-stale-queue
//                 and generate-hot-topics
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CRON_SECRET = Deno.env.get("CRON_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Minutes of silence on an 'active' debate before we consider the
// other player gone for good. Keep in sync with any client-side
// copy that references this number.
const STALE_MINUTES = 10;

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data, error } = await supabase.rpc("expire_stale_debates", {
      p_minutes: STALE_MINUTES,
    });

    if (error) throw error;

    const count = data?.length ?? 0;
    console.log(`Expired ${count} stale debate(s)`);
    return new Response(JSON.stringify({ ok: true, expired: count, ids: data ?? [] }), {
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
