-- =========================================================
-- VERITAS — AI referee migration
--
-- Adds ai_verdict / ai_scored_at columns to debates, and wires
-- submit_turn() / submit_timeout_turn() to fire the ai-referee
-- Edge Function via pg_net the instant a debate flips to
-- 'completed' — inside the same SECURITY DEFINER transaction
-- that makes the flip, not from the client. This means scoring
-- happens even if the player who lands the final turn (or the
-- player who times out) closes the tab immediately after.
--
-- The client-side heuristic scorer in multiplayer.js is kept as
-- a fallback: it renders instantly, then upgrades to the real
-- AI verdict once ai_verdict lands on the row (the client is
-- already subscribed to UPDATEs on this row, so no extra client
-- code is needed to "notice" it — see multiplayer.js changes).
--
-- BEFORE RUNNING THIS FILE:
-- 1. Enable pg_net (Dashboard → Database → Extensions), or
--    uncomment the line below.
-- 2. Deploy the function:
--      npx supabase functions deploy ai-referee --no-verify-jwt --project-ref <PROJECT_REF>
-- 3. Set its secrets (the referee calls Google Gemini, so it
--    needs the SAME GEMINI_API_KEY generate-hot-topics already
--    uses — not a separate provider key. Pick your own
--    AI_REFEREE_SECRET — any random string, it just has to
--    match what you paste below):
--      npx supabase secrets set GEMINI_API_KEY=... AI_REFEREE_SECRET=... --project-ref <PROJECT_REF>
-- 4. Replace <PROJECT_REF> and <AI_REFEREE_SECRET> in
--    notify_ai_referee() below with your real values.
-- =========================================================

-- create extension if not exists pg_net with schema extensions;

alter table public.debates
  add column if not exists ai_verdict   jsonb,
  add column if not exists ai_scored_at timestamptz;

-- ---------------------------------------------------------
-- notify_ai_referee() — fire-and-forget POST to the ai-referee
-- function. net.http_post() just queues the request (pg_net's
-- background worker sends it), so this returns immediately.
-- Wrapped in EXCEPTION so a pg_net/network hiccup can NEVER
-- break the turn submission that triggered it.
-- ---------------------------------------------------------
create or replace function public.notify_ai_referee(p_debate_id uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/ai-referee',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-referee-secret', '<AI_REFEREE_SECRET>'
    ),
    body    := jsonb_build_object('debate_id', p_debate_id)
  );
exception when others then
  raise warning 'notify_ai_referee failed for debate %: %', p_debate_id, sqlerrm;
end;
$$;

-- ---------------------------------------------------------
-- submit_turn() — identical to 0001_init.sql, plus a call to
-- notify_ai_referee() the moment the debate flips to 'completed'.
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
      status = new_status
  where id = p_debate_id;

  if new_status = 'completed' then
    perform notify_ai_referee(p_debate_id);
  end if;
end;
$$;

grant execute on function public.submit_turn(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- submit_timeout_turn() — identical to 0001_init.sql, plus the
-- same notify_ai_referee() call on the 'completed' transition.
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
      status = new_status
  where id = p_debate_id;

  if new_status = 'completed' then
    perform notify_ai_referee(p_debate_id);
  end if;
end;
$$;

grant execute on function public.submit_timeout_turn(uuid) to authenticated;
