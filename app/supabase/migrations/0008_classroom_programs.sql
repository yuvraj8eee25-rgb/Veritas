-- =========================================================
-- VERITAS — organisations, invitations, assignments and grading
-- =========================================================

create extension if not exists pgcrypto;
set search_path = public, extensions;

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('coach', 'student')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.classrooms
  add column if not exists organization_id uuid references public.organizations(id) on delete set null;
alter table public.classrooms
  add column if not exists archived_at timestamptz;

create index if not exists classrooms_organization_idx
  on public.classrooms (organization_id, created_at desc);

create table if not exists public.classroom_invites (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  invited_email text,
  token text not null unique,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_uid uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  check (invited_email is null or invited_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create index if not exists classroom_invites_classroom_idx
  on public.classroom_invites (classroom_id, created_at desc);

create table if not exists public.classroom_assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('debate', 'drill', 'position_paper')),
  title text not null check (char_length(trim(title)) between 2 and 120),
  instructions text not null default '' check (char_length(instructions) <= 8000),
  due_at timestamptz,
  attempt_limit int not null default 1 check (attempt_limit between 1 and 10),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists classroom_assignments_classroom_idx
  on public.classroom_assignments (classroom_id, created_at desc);

create table if not exists public.classroom_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
  student_uid uuid not null references auth.users(id) on delete cascade,
  attempt_no int not null check (attempt_no between 1 and 10),
  content text not null check (char_length(trim(content)) between 1 and 30000),
  score numeric(5,2) check (score is null or (score between 0 and 100)),
  feedback text not null default '' check (char_length(feedback) <= 4000),
  submitted_at timestamptz not null default now(),
  graded_at timestamptz,
  graded_by uuid references auth.users(id) on delete set null,
  unique (assignment_id, student_uid, attempt_no)
);

create index if not exists classroom_submissions_assignment_idx
  on public.classroom_submissions (assignment_id, student_uid, attempt_no desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.classroom_invites enable row level security;
alter table public.classroom_assignments enable row level security;
alter table public.classroom_submissions enable row level security;

grant select on public.organizations to authenticated;
grant select on public.organization_members to authenticated;
grant select on public.classroom_assignments to authenticated;
grant select on public.classroom_submissions to authenticated;

create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organization_members om
    where om.organization_id = p_organization_id and om.user_id = auth.uid()
  );
$$;

create or replace function public.is_organization_owner(p_organization_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.owner_uid = auth.uid()
  );
$$;

drop policy if exists "organizations_select_members" on public.organizations;
create policy "organizations_select_members" on public.organizations
  for select using (
    owner_uid = auth.uid()
    or public.is_organization_member(id)
  );

drop policy if exists "organization_members_select_members" on public.organization_members;
create policy "organization_members_select_members" on public.organization_members
  for select using (
    user_id = auth.uid()
    or public.is_organization_owner(organization_id)
  );

drop policy if exists "classroom_assignments_select_members" on public.classroom_assignments;
create policy "classroom_assignments_select_members" on public.classroom_assignments
  for select using (public.is_classroom_member(classroom_id));

drop policy if exists "classroom_submissions_select_participants" on public.classroom_submissions;
create policy "classroom_submissions_select_participants" on public.classroom_submissions
  for select using (
    student_uid = auth.uid()
    or exists (
      select 1 from public.classroom_assignments a
      join public.classrooms c on c.id = a.classroom_id
      where a.id = classroom_submissions.assignment_id and c.owner_uid = auth.uid()
    )
  );

create or replace function public.create_organization(p_name text)
returns table (id uuid, name text, role text, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
  new_id uuid;
  clean_name text := trim(coalesce(p_name, ''));
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 120 then
    raise exception 'organisation name must be 2-120 characters';
  end if;
  insert into public.organizations (owner_uid, name)
  values (my_uid, clean_name)
  returning organizations.id into new_id;
  insert into public.organization_members (organization_id, user_id, role)
  values (new_id, my_uid, 'coach');
  return query
  select o.id, o.name, 'coach'::text, o.created_at
  from public.organizations o where o.id = new_id;
end;
$$;

create or replace function public.list_my_organizations()
returns table (id uuid, name text, role text, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select o.id, o.name,
    case when o.owner_uid = auth.uid() then 'coach' else coalesce(om.role, 'student') end,
    o.created_at
  from public.organizations o
  left join public.organization_members om
    on om.organization_id = o.id and om.user_id = auth.uid()
  where o.owner_uid = auth.uid() or om.user_id = auth.uid()
  order by o.created_at desc;
$$;

create or replace function public.create_cohort(
  p_name text,
  p_description text default '',
  p_organization_id uuid default null
)
returns table (
  id uuid, name text, description text, invite_code text, role text,
  member_count int, created_at timestamptz, organization_id uuid, organization_name text
)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  my_uid uuid := auth.uid();
  new_id uuid;
  code text;
  clean_name text := trim(coalesce(p_name, ''));
  clean_description text := trim(coalesce(p_description, ''));
  org_name text;
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  if char_length(clean_name) < 2 or char_length(clean_name) > 80 then
    raise exception 'cohort name must be 2-80 characters';
  end if;
  if char_length(clean_description) > 240 then
    raise exception 'cohort description must be 240 characters or fewer';
  end if;
  if p_organization_id is not null then
    select o.name into org_name from public.organizations o
    where o.id = p_organization_id and (o.owner_uid = my_uid or exists (
      select 1 from public.organization_members om
      where om.organization_id = o.id and om.user_id = my_uid and om.role = 'coach'
    ));
    if org_name is null then raise exception 'organisation not found or not a coach'; end if;
  end if;
  code := public.veritas_new_invite_code();
  insert into public.classrooms (owner_uid, organization_id, name, description, invite_code)
  values (my_uid, p_organization_id, clean_name, clean_description, code)
  returning classrooms.id into new_id;
  insert into public.classroom_members (classroom_id, user_id, role)
  values (new_id, my_uid, 'coach');
  if p_organization_id is not null then
    insert into public.organization_members (organization_id, user_id, role)
    values (p_organization_id, my_uid, 'coach') on conflict (organization_id, user_id) do update set role = 'coach';
  end if;
  return query
  select c.id, c.name, c.description, c.invite_code, 'coach'::text,
    (select count(*)::int from public.classroom_members cm where cm.classroom_id = c.id),
    c.created_at, c.organization_id, org_name
  from public.classrooms c where c.id = new_id;
end;
$$;

create or replace function public.list_my_classroom_workspace(p_include_archived boolean default false)
returns table (
  id uuid, name text, description text, invite_code text, role text, member_count int,
  created_at timestamptz, organization_id uuid, organization_name text, archived boolean
)
language sql security definer set search_path = public
as $$
  select c.id, c.name, c.description, c.invite_code,
    case when c.owner_uid = auth.uid() then 'coach' else coalesce(cm.role, 'student') end,
    (select count(*)::int from public.classroom_members members where members.classroom_id = c.id),
    c.created_at, c.organization_id, o.name, c.archived
  from public.classrooms c
  left join public.classroom_members cm on cm.classroom_id = c.id and cm.user_id = auth.uid()
  left join public.organizations o on o.id = c.organization_id
  where (c.owner_uid = auth.uid() or cm.user_id = auth.uid())
    and (p_include_archived or not c.archived)
  order by c.created_at desc;
$$;

create or replace function public.create_classroom_invite(p_classroom_id uuid, p_email text default null)
returns table (id uuid, token text, invited_email text, expires_at timestamptz)
language plpgsql security definer set search_path = public, extensions
as $$
declare
  my_uid uuid := auth.uid();
  invite_id uuid;
  token_value text;
  invite_expires timestamptz;
  email_value text := nullif(lower(trim(p_email)), '');
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.classrooms c where c.id = p_classroom_id and c.owner_uid = my_uid and not c.archived) then
    raise exception 'only the coach can invite students';
  end if;
  if email_value is not null and email_value !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'enter a valid email address';
  end if;
  token_value := encode(gen_random_bytes(18), 'hex');
  insert into public.classroom_invites (classroom_id, invited_email, token, invited_by)
  values (p_classroom_id, email_value, token_value, my_uid)
  returning classroom_invites.id, classroom_invites.token, classroom_invites.invited_email, classroom_invites.expires_at
  into invite_id, token_value, email_value, invite_expires;
  return query select invite_id, token_value, email_value, invite_expires;
end;
$$;

create or replace function public.accept_classroom_invite(p_token text)
returns table (id uuid, name text, description text, invite_code text, role text, member_count int, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
  invite_row public.classroom_invites%rowtype;
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  select i.* into invite_row from public.classroom_invites i
  join public.classrooms c on c.id = i.classroom_id and not c.archived
  where i.token = trim(coalesce(p_token, '')) and i.expires_at > now() and i.accepted_uid is null;
  if not found then raise exception 'invite link is invalid or expired'; end if;
  insert into public.classroom_members (classroom_id, user_id, role)
  values (invite_row.classroom_id, my_uid, 'student') on conflict (classroom_id, user_id) do nothing;
  insert into public.organization_members (organization_id, user_id, role)
  select c.organization_id, my_uid, 'student'
  from public.classrooms c
  where c.id = invite_row.classroom_id and c.organization_id is not null
  on conflict (organization_id, user_id) do nothing;
  update public.classroom_invites set accepted_uid = my_uid where id = invite_row.id;
  return query select c.id, c.name, c.description, c.invite_code, 'student'::text,
    (select count(*)::int from public.classroom_members cm where cm.classroom_id = c.id), c.created_at
  from public.classrooms c where c.id = invite_row.classroom_id and not c.archived;
end;
$$;

create or replace function public.create_classroom_assignment(
  p_classroom_id uuid, p_kind text, p_title text, p_instructions text default '',
  p_due_at timestamptz default null, p_attempt_limit int default 1
)
returns table (id uuid, classroom_id uuid, kind text, title text, instructions text, due_at timestamptz, attempt_limit int, created_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
  assignment_id uuid;
  clean_title text := trim(coalesce(p_title, ''));
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.classrooms c where c.id = p_classroom_id and c.owner_uid = my_uid and not c.archived) then
    raise exception 'only the coach can create assignments';
  end if;
  if p_kind not in ('debate', 'drill', 'position_paper') then raise exception 'invalid assignment type'; end if;
  if char_length(clean_title) < 2 or char_length(clean_title) > 120 then raise exception 'title must be 2-120 characters'; end if;
  if p_attempt_limit < 1 or p_attempt_limit > 10 then raise exception 'attempt limit must be 1-10'; end if;
  if p_due_at is not null and p_due_at <= now() then raise exception 'deadline must be in the future'; end if;
  insert into public.classroom_assignments (classroom_id, created_by, kind, title, instructions, due_at, attempt_limit)
  values (p_classroom_id, my_uid, p_kind, clean_title, trim(coalesce(p_instructions, '')), p_due_at, p_attempt_limit)
  returning classroom_assignments.id into assignment_id;
  return query select a.id, a.classroom_id, a.kind, a.title, a.instructions, a.due_at, a.attempt_limit, a.created_at
  from public.classroom_assignments a where a.id = assignment_id;
end;
$$;

create or replace function public.list_classroom_assignments(p_classroom_id uuid)
returns table (id uuid, classroom_id uuid, kind text, title text, instructions text, due_at timestamptz, attempt_limit int, created_at timestamptz, submission_count int, best_score numeric)
language sql security definer set search_path = public
as $$
  select a.id, a.classroom_id, a.kind, a.title, a.instructions, a.due_at, a.attempt_limit, a.created_at,
    (select count(*)::int from public.classroom_submissions s where s.assignment_id = a.id),
    (select max(s.score) from public.classroom_submissions s where s.assignment_id = a.id and (s.student_uid = auth.uid() or exists (
      select 1 from public.classrooms c where c.id = a.classroom_id and c.owner_uid = auth.uid()
    )))
  from public.classroom_assignments a
  where a.classroom_id = p_classroom_id and not a.archived
    and public.is_classroom_member(p_classroom_id)
  order by a.due_at nulls last, a.created_at desc;
$$;

create or replace function public.submit_classroom_assignment(p_assignment_id uuid, p_content text)
returns table (id uuid, assignment_id uuid, attempt_no int, content text, score numeric, feedback text, submitted_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare
  my_uid uuid := auth.uid();
  a public.classroom_assignments%rowtype;
  next_attempt int;
  submission_id uuid;
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  select * into a from public.classroom_assignments where id = p_assignment_id and not archived;
  if not found or not public.is_classroom_member(a.classroom_id) then raise exception 'assignment not found'; end if;
  if p_content is null or char_length(trim(p_content)) = 0 then raise exception 'submission cannot be empty'; end if;
  if a.due_at is not null and now() > a.due_at then raise exception 'deadline has passed'; end if;
  select coalesce(max(s.attempt_no), 0) + 1 into next_attempt from public.classroom_submissions s
  where s.assignment_id = p_assignment_id and s.student_uid = my_uid;
  if next_attempt > a.attempt_limit then raise exception 'attempt limit reached'; end if;
  insert into public.classroom_submissions (assignment_id, student_uid, attempt_no, content)
  values (p_assignment_id, my_uid, next_attempt, trim(p_content)) returning classroom_submissions.id into submission_id;
  return query select s.id, s.assignment_id, s.attempt_no, s.content, s.score, s.feedback, s.submitted_at
  from public.classroom_submissions s where s.id = submission_id;
end;
$$;

create or replace function public.list_classroom_submissions(p_assignment_id uuid)
returns table (id uuid, assignment_id uuid, student_uid uuid, student_name text, attempt_no int, content text, score numeric, feedback text, submitted_at timestamptz, graded_at timestamptz)
language plpgsql security definer set search_path = public
as $$
declare my_uid uuid := auth.uid();
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.classroom_assignments a join public.classrooms c on c.id = a.classroom_id where a.id = p_assignment_id and c.owner_uid = my_uid) then
    raise exception 'only the coach can view submissions';
  end if;
  return query select s.id, s.assignment_id, s.student_uid, coalesce(p.display_name, 'Student'), s.attempt_no, s.content, s.score, s.feedback, s.submitted_at, s.graded_at
  from public.classroom_submissions s left join public.profiles p on p.uid = s.student_uid
  where s.assignment_id = p_assignment_id order by s.submitted_at desc;
end;
$$;

create or replace function public.grade_classroom_submission(p_submission_id uuid, p_score numeric, p_feedback text default '')
returns void
language plpgsql security definer set search_path = public
as $$
declare my_uid uuid := auth.uid();
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  if p_score is null or p_score < 0 or p_score > 100 then raise exception 'score must be 0-100'; end if;
  if not exists (select 1 from public.classroom_submissions s join public.classroom_assignments a on a.id = s.assignment_id join public.classrooms c on c.id = a.classroom_id where s.id = p_submission_id and c.owner_uid = my_uid) then
    raise exception 'only the coach can grade submissions';
  end if;
  update public.classroom_submissions set score = p_score, feedback = trim(coalesce(p_feedback, '')), graded_at = now(), graded_by = my_uid where id = p_submission_id;
end;
$$;

create or replace function public.remove_classroom_student(p_classroom_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare my_uid uuid := auth.uid();
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.classrooms c where c.id = p_classroom_id and c.owner_uid = my_uid) then raise exception 'only the coach can remove students'; end if;
  delete from public.classroom_members where classroom_id = p_classroom_id and user_id = p_user_id and role = 'student';
end;
$$;

create or replace function public.archive_classroom(p_classroom_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare my_uid uuid := auth.uid();
begin
  if my_uid is null then raise exception 'not authenticated'; end if;
  update public.classrooms set archived = true, archived_at = now() where id = p_classroom_id and owner_uid = my_uid;
  if not found then raise exception 'only the coach can archive this cohort'; end if;
end;
$$;

revoke execute on function public.create_organization(text) from public;
revoke execute on function public.list_my_organizations() from public;
revoke execute on function public.is_organization_member(uuid) from public;
revoke execute on function public.is_organization_owner(uuid) from public;
revoke execute on function public.create_cohort(text, text, uuid) from public;
revoke execute on function public.list_my_classroom_workspace(boolean) from public;
revoke execute on function public.create_classroom_invite(uuid, text) from public;
revoke execute on function public.accept_classroom_invite(text) from public;
revoke execute on function public.create_classroom_assignment(uuid, text, text, text, timestamptz, int) from public;
revoke execute on function public.list_classroom_assignments(uuid) from public;
revoke execute on function public.submit_classroom_assignment(uuid, text) from public;
revoke execute on function public.list_classroom_submissions(uuid) from public;
revoke execute on function public.grade_classroom_submission(uuid, numeric, text) from public;
revoke execute on function public.remove_classroom_student(uuid, uuid) from public;
revoke execute on function public.archive_classroom(uuid) from public;

grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.list_my_organizations() to authenticated;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_owner(uuid) to authenticated;
grant execute on function public.create_cohort(text, text, uuid) to authenticated;
grant execute on function public.list_my_classroom_workspace(boolean) to authenticated;
grant execute on function public.create_classroom_invite(uuid, text) to authenticated;
grant execute on function public.accept_classroom_invite(text) to authenticated;
grant execute on function public.create_classroom_assignment(uuid, text, text, text, timestamptz, int) to authenticated;
grant execute on function public.list_classroom_assignments(uuid) to authenticated;
grant execute on function public.submit_classroom_assignment(uuid, text) to authenticated;
grant execute on function public.list_classroom_submissions(uuid) to authenticated;
grant execute on function public.grade_classroom_submission(uuid, numeric, text) to authenticated;
grant execute on function public.remove_classroom_student(uuid, uuid) to authenticated;
grant execute on function public.archive_classroom(uuid) to authenticated;

notify pgrst, 'reload schema';
