-- =========================================================
-- VERITAS — stale-debate cleanup
--
-- Fixes the bug where, if a player closes their tab mid-debate,
-- their opponent is stuck on "Opponent's turn" forever. The
-- 30s per-turn timer (`beginTurnTimer()` in multiplayer.js)
-- that would normally auto-pass a slow turn only runs inside
-- the browser of whoever currently owns the turn — if that
-- player's tab is gone, no client is left to fire it.
--
-- Fix mirrors the existing cleanup-stale-queue pattern: track
-- last_turn_at on each debate, and sweep it periodically from a
-- scheduled Edge Function (cleanup-stale-debates), same as
-- match_queue is already swept.
--
-- BEFORE RUNNING THIS FILE:
-- 1. Deploy the new function:
--      npx supabase functions deploy cleanup-stale-debates --no-verify-jwt --project-ref <PROJECT_REF>
--    (reuses the same CRON_SECRET already set for cleanup-stale-queue)
-- 2. Uncomment + fill in the cron.schedule() block at the bottom
--    (same <PROJECT_REF> / <CRON_SECRET> as 0001_init.sql) and run it.
-- =========================================================

alter table public.debates
  add column if not exists last_turn_at timestamptz not null default now();

-- Index that backs the "which active debates have gone quiet" scan
-- in expire_stale_debates().
create index if not exists debates_active_stale_idx
  on public.debates (last_turn_at)
  where status = 'active';

-- ---------------------------------------------------------
-- submit_turn() — identical to 0002_ai_referee.sql, plus
-- stamping last_turn_at so the stale sweep knows this debate
-- is still alive.
-- ---------------------------------------------------------
create or replace function public.submit_turn(p_debate_id uuid, p_text text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid      uuid := auth.uid();
  d           record;
  whose_turn  uuid;
  new_turns   jsonb;
  total_turns int;
  new_status  text;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_text is null or length(trim(p_text)) = 0 then
    raise exception 'empty turn';
  end if;

  select * into d from debates where id = p_debate_id for update;
  if d is null then
    raise exception 'debate not found';
  end if;
  if not (my_uid = any(d.players)) then
    raise exception 'not a player in this debate';
  end if;
  if d.status <> 'active' then
    raise exception 'debate not active';
  end if;

  whose_turn := d.player_order[(d.turn_index % 2) + 1]; -- pg arrays are 1-indexed
  if whose_turn <> my_uid then
    raise exception 'not your turn';
  end if;

  new_turns := d.turns || jsonb_build_object(
    'uid', my_uid, 'text', p_text, 'ts', (extract(epoch from now()) * 1000)::bigint
  );
  total_turns := d.max_turns_per_player * 2;
  new_status  := case when jsonb_array_length(new_turns) >= total_turns then 'completed' else 'active' end;

  update debates
  set turns = new_turns,
      turn_index = d.turn_index + 1,
      status = new_status,
      last_turn_at = now()
  where id = p_debate_id;

  if new_status = 'completed' then
    perform notify_ai_referee(p_debate_id);
  end if;
end;
$$;

grant execute on function public.submit_turn(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- submit_timeout_turn() — identical to 0002_ai_referee.sql,
-- plus the same last_turn_at stamp.
-- ---------------------------------------------------------
create or replace function public.submit_timeout_turn(p_debate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid      uuid := auth.uid();
  d           record;
  whose_turn  uuid;
  new_turns   jsonb;
  total_turns int;
  n           int;
  all_passes  boolean := false;
  new_status  text;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into d from debates where id = p_debate_id for update;
  if d is null or d.status <> 'active' then
    return; -- mirrors original best-effort, non-fatal behavior
  end if;

  whose_turn := d.player_order[(d.turn_index % 2) + 1];
  if whose_turn <> my_uid then
    return;
  end if;

  new_turns := d.turns || jsonb_build_object(
    'uid', my_uid, 'text', '⏳ Time''s up — passing the turn.', 'ts', (extract(epoch from now()) * 1000)::bigint
  );
  total_turns := d.max_turns_per_player * 2;
  n := jsonb_array_length(new_turns);

  if n >= 2 then
    select bool_and((elem ->> 'text') like '⏳%')
    into all_passes
    from jsonb_array_elements(new_turns) with ordinality as t(elem, idx)
    where idx > n - 2;
  end if;

  new_status := case when coalesce(all_passes, false) or n >= total_turns then 'completed' else 'active' end;

  update debates
  set turns = new_turns,
      turn_index = d.turn_index + 1,
      status = new_status,
      last_turn_at = now()
  where id = p_debate_id;

  if new_status = 'completed' then
    perform notify_ai_referee(p_debate_id);
  end if;
end;
$$;

grant execute on function public.submit_timeout_turn(uuid) to authenticated;

-- ---------------------------------------------------------
-- expire_stale_debates() — the actual fix. Called every few
-- minutes by the cleanup-stale-debates Edge Function (service
-- role, so it runs regardless of which/whether any player is
-- still connected). Any 'active' debate that hasn't seen a
-- turn in p_minutes is flipped to 'completed', exactly what
-- happens when the debate ends normally — the client already
-- treats any status !== 'active' as "debate over" and shows the
-- end panel, so no front-end change is needed. Also fires the
-- same notify_ai_referee() the normal completion path uses, so
-- an abandoned debate still gets scored on whatever transcript
-- exists (ai-referee already no-ops gracefully on zero turns).
-- ---------------------------------------------------------
create or replace function public.expire_stale_debates(p_minutes int default 10)
returns setof uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_id uuid;
begin
  for expired_id in
    update debates
    set status = 'completed'
    where status = 'active'
      and last_turn_at < now() - (p_minutes || ' minutes')::interval
    returning id
  loop
    perform notify_ai_referee(expired_id);
    return next expired_id;
  end loop;
  return;
end;
$$;

-- Only the service role (i.e. the cleanup-stale-debates Edge
-- Function) should be able to force-complete other players'
-- debates — never grant this to `authenticated`.
grant execute on function public.expire_stale_debates(int) to service_role;

-- ---------------------------------------------------------
-- SCHEDULING — same pg_cron / pg_net setup as 0001_init.sql.
-- Fill in <PROJECT_REF> and <CRON_SECRET> (the same value
-- already used for the other two scheduled functions) before
-- running this section.
-- ---------------------------------------------------------
-- select cron.schedule(
--   'expire-stale-debates-5min',
--   '*/5 * * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-stale-debates',
--     headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
--   );
--   $cron$
-- );
