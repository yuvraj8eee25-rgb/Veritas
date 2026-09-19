-- =========================================================
-- VERITAS — reconcile the profiles schema collision
--
-- Two different sessions both wrote a "0004_*.sql" migration
-- creating public.profiles with incompatible shapes:
--   0004_elo_system.sql   -> uid, elo_rating, wins, losses, ties, games_played
--   0004_profiles.sql     -> uid, display_name, progress jsonb
-- 0004_elo_system.sql ran first in the live project; running
-- 0004_profiles.sql afterward failed on a duplicate policy name
-- (its `create table if not exists` was a no-op, so its columns
-- never landed). DO NOT re-run 0004_profiles.sql — it's superseded
-- by this file.
--
-- This migration is safe to run regardless of whether
-- 0005_display_names.sql was ever run — every statement below is
-- idempotent (add-if-missing, drop-then-recreate for the
-- constraint/function), so running it twice, or after 0005, or
-- instead of 0005, all land in the same end state:
--   profiles now has BOTH the ELO columns (ranked standing) AND
--   display_name + progress (solo XP/streak/badges mirror), so
--   the two progress systems finally share one row per player.
--
-- Client-side: app.js's pushProfileToServer() currently does a
-- raw `.from("profiles").upsert(...)`, which will fail — the ELO
-- migration deliberately grants NO direct insert/update policy on
-- profiles (writes only through SECURITY DEFINER functions, so a
-- modified client can't spoof its own rating or someone else's
-- progress). Use the sync_profile() RPC below instead — see the
-- accompanying app.js patch.
-- =========================================================

/* ---------------------------------------------------------
   1. Add the missing columns to whatever profiles already is
   --------------------------------------------------------- */

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add column if not exists progress jsonb not null default '{}'::jsonb;

-- Drop-then-recreate so this is safe whether or not 0005 already
-- added a narrower version of this constraint. Widened to 24 chars
-- to match app.js's actual client-side limit (renameDisplayName
-- allows up to 24; 0005 had only allowed 20 — this reconciles that
-- mismatch too).
alter table public.profiles
  drop constraint if exists profiles_display_name_check;

alter table public.profiles
  add constraint profiles_display_name_check
  check (
    display_name is null
    or (
      char_length(display_name) between 2 and 24
      and display_name ~ '^[A-Za-z0-9 _.''-]+$'
    )
  );

/* ---------------------------------------------------------
   2. Give every existing profile a name if it doesn't have one
      yet (rows created only via the ELO trigger never got one)
   --------------------------------------------------------- */

update public.profiles
set display_name =
  (array['Sharp','Bold','Quiet','Rapid','Keen','Steady','Fierce','Calm','Sly','Iron'])[1 + floor(random() * 10)::int]
  || ' ' ||
  (array['Falcon','Orator','Fox','Debater','Wolf','Sage','Raven','Tactician','Hawk','Rhetor'])[1 + floor(random() * 10)::int]
  || ' ' || floor(random() * 900 + 100)::int
where display_name is null;

/* ---------------------------------------------------------
   3. handle_new_user() — own this fully now, so whichever of
      the two earlier versions is currently installed gets
      replaced with one that sets BOTH a name and leaves ELO
      defaults intact (elo_rating/wins/etc. already default in
      the column definitions from 0004_elo_system.sql).
   --------------------------------------------------------- */

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  adjectives text[] := array['Sharp','Bold','Quiet','Rapid','Keen','Steady','Fierce','Calm','Sly','Iron'];
  nouns      text[] := array['Falcon','Orator','Fox','Debater','Wolf','Sage','Raven','Tactician','Hawk','Rhetor'];
begin
  insert into public.profiles (uid, display_name)
  values (
    new.id,
    adjectives[1 + floor(random() * array_length(adjectives, 1))::int]
      || ' ' || nouns[1 + floor(random() * array_length(nouns, 1))::int]
      || ' ' || floor(random() * 900 + 100)::int
  )
  on conflict (uid) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ---------------------------------------------------------
   4. sync_profile() — the ONLY way a client writes its own
      display_name/progress. Mirrors the security model
      0004_elo_system.sql already established (no direct
      insert/update grant on profiles at all) and the
      validated-RPC pattern 0001_init.sql / 0005 already use
      elsewhere (attempt_match, submit_turn, set_display_name).
      Never touches elo_rating/wins/losses/ties/games_played —
      those are exclusively written by apply_elo_update().
   --------------------------------------------------------- */

create or replace function public.sync_profile(p_display_name text, p_progress jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
  clean_name text := nullif(trim(p_display_name), '');
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;
  if clean_name is not null and (
    char_length(clean_name) < 2 or char_length(clean_name) > 24
    or clean_name !~ '^[A-Za-z0-9 _.''-]+$'
  ) then
    raise exception 'invalid display name';
  end if;

  insert into public.profiles (uid, display_name, progress)
  values (my_uid, coalesce(clean_name, 'Debater'), coalesce(p_progress, '{}'::jsonb))
  on conflict (uid) do update set
    display_name = coalesce(clean_name, profiles.display_name),
    progress = coalesce(p_progress, profiles.progress),
    updated_at = now();
end;
$$;

grant execute on function public.sync_profile(text, jsonb) to authenticated, anon;
