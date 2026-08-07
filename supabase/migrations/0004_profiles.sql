-- =========================================================
-- VERITAS — lightweight persistent identity
--
-- Anonymous auth gives every device a stable uid, but nothing
-- server-side was ever attached to it: XP/streak/badges lived
-- only in localStorage, and opponents showed up as a bare
-- "Opponent" with no name. This adds one `profiles` row per
-- auth user with:
--   - display_name: editable, auto-generated on first sign-in
--     so a name always exists (no login/onboarding screen needed)
--   - progress: a jsonb mirror of the client's local game state
--     (xp, streak, badges, mode stats, activity heatmap), kept
--     in sync by app.js so switching browsers/devices doesn't
--     wipe progress
--
-- Safe to run on an existing project: only adds a new table +
-- trigger, touches nothing in 0001-0003.
-- =========================================================

create table if not exists public.profiles (
  uid          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  progress     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter publication supabase_realtime add table public.profiles;

alter table public.profiles enable row level security;

grant select on public.profiles to authenticated;
grant insert, update on public.profiles to authenticated;

-- Any signed-in client can read any profile — needed so a debate
-- room can show the opponent's name and the leaderboard can show
-- everyone's, same trust level match_queue already grants.
create policy "profiles_select_all" on public.profiles
  for select using (auth.role() = 'authenticated');

-- ...but each client may only ever write its own row.
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = uid);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = uid) with check (auth.uid() = uid);

-- ---------------------------------------------------------
-- Auto-create a profile (with a fun default name) the moment a
-- new anonymous user is provisioned, so display_name is never
-- null and a name is ready before the client ever calls upsert.
-- ---------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  adjectives text[] := array['Sharp', 'Bold', 'Quiet', 'Rapid', 'Keen', 'Steady', 'Fierce', 'Calm', 'Sly', 'Iron'];
  nouns      text[] := array['Falcon', 'Orator', 'Fox', 'Debater', 'Wolf', 'Sage', 'Raven', 'Tactician', 'Hawk', 'Rhetor'];
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

-- Backfill: anyone already signed in before this migration ran
-- gets a profile lazily created by the client's first upsert
-- instead (see syncProfile() in app.js), since we can't run the
-- trigger retroactively on existing auth.users rows.
