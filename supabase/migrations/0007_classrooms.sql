-- =========================================================
-- VERITAS — coach classrooms and cohorts
--
-- A classroom is owned by one coach. Students join with a short
-- invite code. All writes go through SECURITY DEFINER functions so
-- the client cannot forge ownership or membership roles.
-- =========================================================

-- Invite codes use gen_random_bytes(), and classroom IDs use gen_random_uuid().
-- Enable the Supabase-supported extension before defining those defaults/functions.
create extension if not exists pgcrypto;
-- Supabase may install extensions in `extensions`, while older projects use
-- `public`; keeping both in the migration search path supports either layout.
set search_path = public, extensions;

create table if not exists public.classrooms (
  id           uuid primary key default gen_random_uuid(),
  owner_uid    uuid not null references auth.users(id) on delete cascade,
  name         text not null check (char_length(trim(name)) between 2 and 80),
  description  text not null default '' check (char_length(description) <= 240),
  invite_code  text not null unique check (invite_code ~ '^[A-Z2-9]{8}$'),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table if not exists public.classroom_members (
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'student' check (role in ('coach', 'student')),
  joined_at    timestamptz not null default now(),
  primary key (classroom_id, user_id)
);

create index if not exists classroom_members_user_idx
  on public.classroom_members (user_id, joined_at desc);

alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;

grant select on public.classrooms to authenticated;
grant select on public.classroom_members to authenticated;

create or replace function public.is_classroom_member(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classroom_members
    where classroom_id = p_classroom_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_classroom_owner(p_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classrooms
    where id = p_classroom_id
      and owner_uid = auth.uid()
  );
$$;

drop policy if exists "classrooms_select_members" on public.classrooms;
create policy "classrooms_select_members" on public.classrooms
  for select using (
    auth.uid() = owner_uid
    or public.is_classroom_member(id)
  );

drop policy if exists "classroom_members_select_members" on public.classroom_members;
create policy "classroom_members_select_members" on public.classroom_members
  for select using (
    auth.uid() = user_id
    or public.is_classroom_owner(classroom_id)
  );

create or replace function public.veritas_new_invite_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  candidate text;
begin
  loop
    candidate := upper(substr(translate(encode(gen_random_bytes(8), 'base64'), '+/=', 'XYZ'), 1, 8));
    if candidate !~ '^[A-Z2-9]{8}$' then
      continue;
    end if;
    if not exists (select 1 from public.classrooms where public.classrooms.invite_code = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;

create or replace function public.create_classroom(
  p_name text,
  p_description text default ''
)
returns table (
  id uuid,
  name text,
  description text,
  invite_code text,
  role text,
  member_count int,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
  new_id uuid;
  cleaned_name text := trim(coalesce(p_name, ''));
  cleaned_description text := trim(coalesce(p_description, ''));
  code text;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;
  if char_length(cleaned_name) < 2 or char_length(cleaned_name) > 80 then
    raise exception 'classroom name must be 2-80 characters';
  end if;
  if char_length(cleaned_description) > 240 then
    raise exception 'classroom description must be 240 characters or fewer';
  end if;

  code := public.veritas_new_invite_code();
  insert into public.classrooms (owner_uid, name, description, invite_code)
  values (my_uid, cleaned_name, cleaned_description, code)
  returning classrooms.id into new_id;

  insert into public.classroom_members (classroom_id, user_id, role)
  values (new_id, my_uid, 'coach');

  return query
  select c.id, c.name, c.description, c.invite_code, 'coach'::text,
         (select count(*)::int from public.classroom_members cm where cm.classroom_id = c.id),
         c.created_at
  from public.classrooms c
  where c.id = new_id;
end;
$$;

create or replace function public.list_my_classrooms()
returns table (
  id uuid,
  name text,
  description text,
  invite_code text,
  role text,
  member_count int,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select c.id, c.name, c.description, c.invite_code,
         case when c.owner_uid = auth.uid() then 'coach' else coalesce(cm.role, 'student') end,
         (select count(*)::int from public.classroom_members members where members.classroom_id = c.id),
         c.created_at
  from public.classrooms c
  left join public.classroom_members cm
    on cm.classroom_id = c.id and cm.user_id = auth.uid()
  where not c.archived
    and (c.owner_uid = auth.uid() or cm.user_id = auth.uid())
  order by c.created_at desc;
$$;

create or replace function public.join_classroom(p_invite_code text)
returns table (
  id uuid,
  name text,
  description text,
  invite_code text,
  role text,
  member_count int,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
  classroom_row public.classrooms%rowtype;
  member_role text;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into classroom_row
  from public.classrooms
  where public.classrooms.invite_code = upper(trim(coalesce(p_invite_code, '')))
    and not public.classrooms.archived;

  if not found then
    raise exception 'classroom invite code not found';
  end if;

  if classroom_row.owner_uid = my_uid then
    member_role := 'coach';
  else
    insert into public.classroom_members (classroom_id, user_id, role)
    values (classroom_row.id, my_uid, 'student')
    on conflict (classroom_id, user_id) do nothing;
    member_role := 'student';
  end if;

  return query
  select classroom_row.id, classroom_row.name, classroom_row.description,
         classroom_row.invite_code, member_role,
         (select count(*)::int from public.classroom_members cm where cm.classroom_id = classroom_row.id),
         classroom_row.created_at;
end;
$$;

create or replace function public.list_classroom_members(p_classroom_id uuid)
returns table (
  user_id uuid,
  display_name text,
  role text,
  joined_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;
  if not exists (
    select 1 from public.classrooms c
    left join public.classroom_members cm on cm.classroom_id = c.id and cm.user_id = my_uid
    where c.id = p_classroom_id
      and (c.owner_uid = my_uid or cm.user_id = my_uid)
  ) then
    raise exception 'not a classroom member';
  end if;

  return query
  select cm.user_id, coalesce(p.display_name, 'Student'), cm.role, cm.joined_at
  from public.classroom_members cm
  left join public.profiles p on p.uid = cm.user_id
  where cm.classroom_id = p_classroom_id
  order by case when cm.role = 'coach' then 0 else 1 end, cm.joined_at;
end;
$$;

-- Ask PostgREST to pick up the new RPC signatures immediately after the
-- migration is applied instead of waiting for its periodic schema refresh.
revoke execute on function public.veritas_new_invite_code() from public;
revoke execute on function public.create_classroom(text, text) from public;
revoke execute on function public.list_my_classrooms() from public;
revoke execute on function public.join_classroom(text) from public;
revoke execute on function public.list_classroom_members(uuid) from public;
revoke execute on function public.is_classroom_member(uuid) from public;
revoke execute on function public.is_classroom_owner(uuid) from public;

grant execute on function public.create_classroom(text, text) to authenticated;
grant execute on function public.list_my_classrooms() to authenticated;
grant execute on function public.join_classroom(text) to authenticated;
grant execute on function public.list_classroom_members(uuid) to authenticated;
grant execute on function public.is_classroom_member(uuid) to authenticated;
grant execute on function public.is_classroom_owner(uuid) to authenticated;

notify pgrst, 'reload schema';
