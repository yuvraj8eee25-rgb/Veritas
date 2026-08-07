-- =========================================================
-- VERITAS — ELO rating system (Task A of 2)
--
-- Adds a `profiles` table (one row per user, holding their ELO
-- rating + win/loss/tie record) and a trigger that recalculates
-- both players' ratings automatically the instant a multiplayer
-- debate gets its ai_verdict written (by the ai-referee function
-- from the 0002 migration). No client code calls anything here
-- directly — it's fully server-side, so ratings can't be spoofed
-- by a modified client.
--
-- Scope: this covers 1v1 multiplayer debates only (the `debates`
-- table). "Debate the AI" (ai-debate.js) is solo practice against
-- a bot and doesn't write to `debates`, so it intentionally does
-- NOT affect ELO — there's no opponent rating to compare against.
--
-- BEFORE RUNNING: just run this file in the SQL Editor, same as
-- 0001-0003. No new secrets or Edge Function needed — it's pure
-- SQL, no external calls.
--
-- TASK B (separate, client-side, not in this file):
-- - Add a "Debate ELO" tab to the existing leaderboard
--   (index.html already has weekly/all-time tabs + app.js's
--   renderLeaderboard() — this just needs a 3rd, Supabase-backed
--   tab querying `profiles` ordered by elo_rating desc).
-- - Show the player's own elo_rating + record on the Profile
--   screen (screen-profile in index.html).
-- - Optionally show the rating delta (+14 / -9) on the multiplayer
--   debate-ended panel once ai_verdict lands, since the client is
--   already subscribed to UPDATEs on that debates row.
-- =========================================================

/* ---------------------------------------------------------
   1. profiles table
   --------------------------------------------------------- */

create table if not exists public.profiles (
  uid          uuid primary key references auth.users(id) on delete cascade,
  elo_rating   int not null default 1200,
  wins         int not null default 0,
  losses       int not null default 0,
  ties         int not null default 0,
  games_played int not null default 0,
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

grant select on public.profiles to authenticated, anon;

-- Leaderboards need to read everyone's rating, so select is public.
-- There is deliberately NO insert/update/delete policy for clients —
-- profiles are only ever written by the SECURITY DEFINER functions
-- below, never directly by a user's own request.
create policy "profiles_select_all" on public.profiles
  for select using (true);

/* ---------------------------------------------------------
   2. Auto-create a profile row the moment a user is created
      (covers anonymous sign-in, which is how every Veritas
      player gets a uid — see supabase-config.js).
   --------------------------------------------------------- */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (uid) values (new.id)
  on conflict (uid) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Safety net for any users created BEFORE this migration ran
-- (so existing players get a profile row retroactively too).
insert into public.profiles (uid)
select id from auth.users
on conflict (uid) do nothing;

/* ---------------------------------------------------------
   3. ELO calculation
      Standard logistic ELO, K=32. Ties split the point (0.5/0.5).
   --------------------------------------------------------- */

create or replace function public.apply_elo_update(p_debate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d            record;
  verdict      jsonb;
  winner_uid   uuid;
  uid_a        uuid;
  uid_b        uuid;
  rating_a     int;
  rating_b     int;
  expected_a   numeric;
  expected_b   numeric;
  actual_a     numeric;
  actual_b     numeric;
  new_rating_a int;
  new_rating_b int;
  k            constant int := 32;
begin
  select id, players, ai_verdict into d from debates where id = p_debate_id;
  if d is null or d.ai_verdict is null then
    return; -- nothing to score yet, or debate not found
  end if;
  if array_length(d.players, 1) <> 2 then
    return; -- ELO is defined for 1v1 only
  end if;

  verdict := d.ai_verdict;
  uid_a := d.players[1];
  uid_b := d.players[2];

  -- Ensure both players have a profile row (safety net; should already
  -- exist via the on_auth_user_created trigger).
  insert into profiles (uid) values (uid_a) on conflict (uid) do nothing;
  insert into profiles (uid) values (uid_b) on conflict (uid) do nothing;

  select elo_rating into rating_a from profiles where uid = uid_a;
  select elo_rating into rating_b from profiles where uid = uid_b;

  winner_uid := case
    when verdict ->> 'winnerUid' is not null then (verdict ->> 'winnerUid')::uuid
    else null
  end;

  if winner_uid = uid_a then
    actual_a := 1; actual_b := 0;
  elsif winner_uid = uid_b then
    actual_a := 0; actual_b := 1;
  else
    actual_a := 0.5; actual_b := 0.5; -- tie (winner_uid null, or didn't match either player)
  end if;

  expected_a := 1.0 / (1.0 + power(10, (rating_b - rating_a) / 400.0));
  expected_b := 1.0 / (1.0 + power(10, (rating_a - rating_b) / 400.0));

  new_rating_a := round(rating_a + k * (actual_a - expected_a));
  new_rating_b := round(rating_b + k * (actual_b - expected_b));

  update profiles set
    elo_rating   = new_rating_a,
    wins         = wins + (case when actual_a = 1 then 1 else 0 end),
    losses       = losses + (case when actual_a = 0 then 1 else 0 end),
    ties         = ties + (case when actual_a = 0.5 then 1 else 0 end),
    games_played = games_played + 1,
    updated_at   = now()
  where uid = uid_a;

  update profiles set
    elo_rating   = new_rating_b,
    wins         = wins + (case when actual_b = 1 then 1 else 0 end),
    losses       = losses + (case when actual_b = 0 then 1 else 0 end),
    ties         = ties + (case when actual_b = 0.5 then 1 else 0 end),
    games_played = games_played + 1,
    updated_at   = now()
  where uid = uid_b;
end;
$$;

/* ---------------------------------------------------------
   4. Trigger: fire apply_elo_update() the instant ai_verdict
      transitions from null to non-null on a debates row.
      Wrapped so an ELO calc error can NEVER block the verdict
      write itself (the write already happened by the time this
      AFTER trigger runs; we just don't want a bug here to turn
      into a 500 for the ai-referee function).
   --------------------------------------------------------- */

create or replace function public.trigger_apply_elo_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.ai_verdict is null and new.ai_verdict is not null then
    begin
      perform apply_elo_update(new.id);
    exception when others then
      raise warning 'apply_elo_update failed for debate %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists on_debate_scored_update_elo on public.debates;
create trigger on_debate_scored_update_elo
  after update on public.debates
  for each row execute function public.trigger_apply_elo_update();
