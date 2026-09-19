-- =========================================================
-- VERITAS — lightweight display names
--
-- Anonymous auth gives every player a stable uid, but nothing
-- human-readable — leaderboard rows and multiplayer opponents
-- currently only ever show "Player 8f2a". This adds an optional
-- display_name to the existing `profiles` table (see
-- 0004_elo_system.sql) and a validated RPC to set it, following
-- the same pattern as attempt_match()/submit_turn()/submit_rating()
-- in 0001_init.sql: all writes go through a SECURITY DEFINER
-- function, never a direct client UPDATE.
--
-- NOTE — this does NOT fix cross-device/browser persistence.
-- Anonymous auth's session token itself lives in that browser's
-- localStorage, so clearing storage still loses the uid (and with
-- it the name, ELO, and W/L record) regardless of this migration.
-- Actually surviving a browser switch needs a real credential
-- (e.g. Supabase's linkIdentity with an email/magic link) — that's
-- a separate, bigger change than a display name.
-- =========================================================

alter table public.profiles
  add column if not exists display_name text;

alter table public.profiles
  add constraint profiles_display_name_check
  check (
    display_name is null
    or (
      char_length(display_name) between 2 and 20
      and display_name ~ '^[A-Za-z0-9 _.''-]+$'
    )
  );

-- ---------------------------------------------------------
-- set_display_name() — the only way a client can write its own
-- display_name. Re-validates server-side (never trust the check
-- constraint alone against a client that skips it via some other
-- path) and upserts a profile row if one doesn't exist yet.
-- ---------------------------------------------------------
create or replace function public.set_display_name(p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid  uuid := auth.uid();
  cleaned text;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;

  cleaned := trim(p_name);

  if cleaned is null or char_length(cleaned) < 2 or char_length(cleaned) > 20 then
    raise exception 'display name must be 2-20 characters';
  end if;
  if cleaned !~ '^[A-Za-z0-9 _.''-]+$' then
    raise exception 'display name can only contain letters, numbers, spaces, and . _ '' -';
  end if;

  insert into profiles (uid, display_name)
  values (my_uid, cleaned)
  on conflict (uid) do update set display_name = excluded.display_name;

  return cleaned;
end;
$$;

grant execute on function public.set_display_name(text) to authenticated;
