-- =========================================================
-- VERITAS — Supabase schema (replaces Firestore)
-- Run this once via `supabase db push`, or paste into the
-- Supabase Dashboard → SQL Editor and run it there.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- TABLES
-- ---------------------------------------------------------

-- Replaces hotTopics/{date} docs.
create table if not exists public.hot_topics (
  date         date primary key,
  topics       jsonb not null,
  generated_at timestamptz not null default now(),
  source       text
);

-- Replaces matchQueue/{uid} docs.
create table if not exists public.match_queue (
  uid        uuid primary key,
  topic      text,
  status     text not null default 'waiting' check (status in ('waiting', 'matched')),
  debate_id  uuid,
  created_at timestamptz not null default now()
);

-- Index that backs the "oldest waiting player" lookup in attempt_match().
create index if not exists match_queue_waiting_idx
  on public.match_queue (created_at)
  where status = 'waiting';

-- Replaces debates/{id} docs.
create table if not exists public.debates (
  id                   uuid primary key default gen_random_uuid(),
  topic                text not null,
  players              uuid[] not null,
  player_order         uuid[] not null,
  turn_index           int not null default 0,
  turns                jsonb not null default '[]'::jsonb,
  max_turns_per_player int not null default 3,
  status               text not null default 'active' check (status in ('active', 'completed')),
  ratings              jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------
-- REALTIME — turns onSnapshot() into postgres_changes()
-- ---------------------------------------------------------
alter publication supabase_realtime add table public.match_queue;
alter publication supabase_realtime add table public.debates;

-- ---------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------
alter table public.hot_topics enable row level security;
alter table public.match_queue enable row level security;
alter table public.debates enable row level security;

grant usage on schema public to authenticated, anon;
grant select on public.hot_topics to authenticated;
grant select, insert, delete on public.match_queue to authenticated;
grant select on public.debates to authenticated;

-- hot_topics: any signed-in (incl. anonymous) client can read.
-- Writes only ever happen from the generate-hot-topics Edge Function,
-- which uses the service-role key and bypasses RLS entirely — so there
-- are intentionally no insert/update policies here.
create policy "hot_topics_select" on public.hot_topics
  for select using (auth.role() = 'authenticated');

-- match_queue: any signed-in client can read the queue (needed so a client
-- can find someone else's waiting row to match against), but may only
-- create or delete its OWN row directly.
create policy "match_queue_select" on public.match_queue
  for select using (auth.role() = 'authenticated');

create policy "match_queue_insert_own" on public.match_queue
  for insert with check (auth.uid() = uid and status = 'waiting');

create policy "match_queue_delete_own" on public.match_queue
  for delete using (auth.uid() = uid);

-- No UPDATE policy on match_queue: flipping a row to "matched" (possibly
-- someone else's row) only ever happens inside attempt_match() below.

-- debates: only the two matched players may read their room.
create policy "debates_select_players" on public.debates
  for select using (auth.uid() = any(players));

-- No INSERT/UPDATE policy on debates: rooms are only created/updated by
-- the SECURITY DEFINER functions below, which re-check every constraint
-- the old Firestore rules enforced (whose turn it is, valid turn shape,
-- rating only after completion, etc.) before writing.

-- ---------------------------------------------------------
-- attempt_match() — replaces the client-side runTransaction() matcher.
-- Uses `FOR UPDATE SKIP LOCKED` so two clients racing for the same
-- opponent simply resolve without the retry loop Firestore needed.
-- ---------------------------------------------------------
create or replace function public.attempt_match(p_fallback_topic text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid         uuid := auth.uid();
  my_topic       text;
  candidate      record;
  chosen_topic   text;
  new_debate_id  uuid;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;

  select topic into my_topic
  from match_queue
  where uid = my_uid and status = 'waiting';

  if not found then
    return null; -- we're not (or no longer) waiting
  end if;

  select * into candidate
  from match_queue
  where status = 'waiting' and uid <> my_uid
  order by created_at asc
  limit 1
  for update skip locked;

  if candidate is null then
    return null; -- nobody else waiting yet — client will poll again
  end if;

  chosen_topic := coalesce(candidate.topic, my_topic, p_fallback_topic, 'Open topic — argue anything!');

  insert into debates (topic, players, player_order, turn_index, turns, max_turns_per_player, status)
  values (
    chosen_topic,
    array[candidate.uid, my_uid],
    array[candidate.uid, my_uid], -- whoever was waiting longer opens
    0, '[]'::jsonb, 3, 'active'
  )
  returning id into new_debate_id;

  update match_queue set status = 'matched', debate_id = new_debate_id where uid = candidate.uid;
  update match_queue set status = 'matched', debate_id = new_debate_id where uid = my_uid;

  return new_debate_id;
end;
$$;

grant execute on function public.attempt_match(text) to authenticated;

-- ---------------------------------------------------------
-- submit_turn() — replaces the sendTurn() runTransaction().
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

  update debates
  set turns = new_turns,
      turn_index = d.turn_index + 1,
      status = case when jsonb_array_length(new_turns) >= total_turns then 'completed' else 'active' end
  where id = p_debate_id;
end;
$$;

grant execute on function public.submit_turn(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- submit_timeout_turn() — replaces submitTimeoutTurn()'s transaction.
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

  update debates
  set turns = new_turns,
      turn_index = d.turn_index + 1,
      status = case when coalesce(all_passes, false) or n >= total_turns then 'completed' else 'active' end
  where id = p_debate_id;
end;
$$;

grant execute on function public.submit_timeout_turn(uuid) to authenticated;

-- ---------------------------------------------------------
-- submit_rating() — replaces the rate-btn's direct Firestore update().
-- ---------------------------------------------------------
create or replace function public.submit_rating(p_debate_id uuid, p_rating text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
  d      record;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_rating not in ('up', 'down') then
    raise exception 'invalid rating';
  end if;

  select * into d from debates where id = p_debate_id;
  if d is null then
    raise exception 'debate not found';
  end if;
  if not (my_uid = any(d.players)) then
    raise exception 'not a player in this debate';
  end if;
  if d.status <> 'completed' then
    raise exception 'debate not completed';
  end if;

  update debates
  set ratings = ratings || jsonb_build_object(my_uid::text, p_rating)
  where id = p_debate_id;
end;
$$;

grant execute on function public.submit_rating(uuid, text) to authenticated;

-- ---------------------------------------------------------
-- SCHEDULING — replaces Firebase's onSchedule() cron provisioning.
-- Requires the pg_cron and pg_net extensions (Dashboard → Database →
-- Extensions, or uncomment the two lines below).
-- Fill in <PROJECT_REF> and <CRON_SECRET> (the same value you set with
-- `supabase secrets set CRON_SECRET=...`) before running this section.
-- ---------------------------------------------------------
-- create extension if not exists pg_cron with schema extensions;
-- create extension if not exists pg_net with schema extensions;
--
-- select cron.schedule(
--   'generate-hot-topics-daily',
--   '0 5 * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/generate-hot-topics',
--     headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
--   );
--   $cron$
-- );
--
-- select cron.schedule(
--   'cleanup-stale-queue-5min',
--   '*/5 * * * *',
--   $cron$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/cleanup-stale-queue',
--     headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>')
--   );
--   $cron$
-- );
