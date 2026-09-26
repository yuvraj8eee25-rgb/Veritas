-- Add rate accounting and private Classroom attachment metadata without
-- changing or removing existing application data.
create table if not exists public.veritas_request_log (
  user_id uuid not null,
  action text not null,
  requested_at timestamptz not null default now()
);
create index if not exists veritas_request_log_window_idx
  on public.veritas_request_log(user_id, action, requested_at desc);
create index if not exists veritas_request_log_retention_idx
  on public.veritas_request_log(requested_at);
alter table public.veritas_request_log enable row level security;
revoke all on public.veritas_request_log from public, anon, authenticated;

create or replace function public.consume_veritas_quota(
  p_user_id uuid, p_action text, p_limit integer, p_window_seconds integer
) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare used_count integer;
begin
  if auth.role() is distinct from 'service_role' or p_user_id is null
     or p_action not in ('ai-debate','assess-evidence','exa-search','classroom-email')
     or p_limit not between 1 and 100 or p_window_seconds not between 1 and 86400 then
    raise exception 'invalid quota request';
  end if;
  delete from public.veritas_request_log where requested_at < now() - interval '2 days';
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_action, 0));
  delete from public.veritas_request_log
    where user_id=p_user_id and action=p_action
      and requested_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into used_count from public.veritas_request_log
    where user_id=p_user_id and action=p_action;
  if used_count >= p_limit then return false; end if;
  insert into public.veritas_request_log(user_id,action) values(p_user_id,p_action);
  return true;
end $$;
revoke all on function public.consume_veritas_quota(uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_veritas_quota(uuid,text,integer,integer) to service_role;

-- Leaderboard/opponent lookups are signed-in features; anonymous SQL sessions
-- do not need direct profile-table access.
drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_select_signed_in on public.profiles;
create policy profiles_select_signed_in on public.profiles for select to authenticated using (true);
revoke select on public.profiles from anon, authenticated;
grant select (uid, display_name, elo_rating, wins, losses, ties, games_played, updated_at)
  on public.profiles to authenticated;
create or replace function public.get_my_profile_progress()
returns jsonb language sql stable security definer set search_path=public as $$
  select p.progress from public.profiles p where p.uid=auth.uid()
$$;
revoke all on function public.get_my_profile_progress() from public, anon;
grant execute on function public.get_my_profile_progress() to authenticated;

-- Realtime matchmaking only subscribes to the caller's queue row; the
-- SECURITY DEFINER matcher handles opponent discovery without exposing the
-- entire queue to every signed-in player.
drop policy if exists match_queue_select on public.match_queue;
drop policy if exists match_queue_select_own on public.match_queue;
create policy match_queue_select_own on public.match_queue
  for select to authenticated using (uid=auth.uid());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('classroom-attachments','classroom-attachments',false,5242880,array['application/pdf','text/plain','image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.classroom_submissions add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.classroom_assignments add column if not exists attachments jsonb not null default '[]'::jsonb;

create or replace function public.register_classroom_attachments(p_submission_id uuid,p_files jsonb)
returns jsonb language plpgsql security definer set search_path=public,extensions,storage as $$
declare u uuid:=auth.uid(); s public.classroom_submissions%rowtype; a public.classroom_assignments%rowtype; f jsonb; current_files jsonb;
begin
  if u is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>5 then raise exception 'Invalid attachment request'; end if;
  select * into s from public.classroom_submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  select * into a from public.classroom_assignments where id=s.assignment_id;
  if s.student_uid<>u or not a.allow_files or not public.cw_access(a.classroom_id) then raise exception 'Attachment access denied'; end if;
  current_files:=coalesce(s.attachments,'[]'::jsonb);
  for f in select value from jsonb_array_elements(p_files) loop
    if (f->>'path') not like u::text||'/'||a.id::text||'/'||s.request_id::text||'/%'
       or (f->>'mime') not in ('application/pdf','text/plain','image/png','image/jpeg')
       or coalesce((f->>'size')::bigint,0) not between 1 and 5242880
       or length(coalesce(f->>'name','')) not between 1 and 180
       or not exists(select 1 from storage.objects o where o.bucket_id='classroom-attachments' and o.name=f->>'path'
         and (o.metadata->>'size')::bigint=(f->>'size')::bigint and lower(o.metadata->>'mimetype')=lower(f->>'mime')) then
      raise exception 'Attachment is invalid or unavailable';
    end if;
    if not current_files @> jsonb_build_array(jsonb_build_object('path',f->>'path')) then
      current_files:=current_files||jsonb_build_array(jsonb_build_object('path',f->>'path','name',f->>'name','mime',f->>'mime','size',(f->>'size')::bigint));
    end if;
  end loop;
  update public.classroom_submissions set attachments=current_files where id=s.id;
  return current_files;
end $$;

create or replace function public.authorize_classroom_attachment(p_submission_id uuid,p_path text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.classroom_submissions s join public.classroom_assignments a on a.id=s.assignment_id
    where s.id=p_submission_id and (s.student_uid=auth.uid() or public.cw_coach(a.classroom_id))
      and s.attachments @> jsonb_build_array(jsonb_build_object('path',p_path)))
$$;
create or replace function public.register_classroom_assignment_attachment(p_assignment_id uuid,p_file jsonb)
returns jsonb language plpgsql security definer set search_path=public,storage as $$
declare u uuid:=auth.uid(); a public.classroom_assignments%rowtype; f jsonb; files jsonb;
begin
  select * into a from public.classroom_assignments where id=p_assignment_id for update;
  if not found or not public.cw_coach(a.classroom_id) then raise exception 'Coach access required'; end if;
  f:=p_file;
  if (f->>'path') not like u::text||'/'||a.id::text||'/assignment/%'
     or (f->>'mime') not in ('application/pdf','text/plain','image/png','image/jpeg')
     or coalesce((f->>'size')::bigint,0) not between 1 and 5242880
     or length(coalesce(f->>'name','')) not between 1 and 180
     or not exists(select 1 from storage.objects o where o.bucket_id='classroom-attachments' and o.name=f->>'path'
       and (o.metadata->>'size')::bigint=(f->>'size')::bigint and lower(o.metadata->>'mimetype')=lower(f->>'mime')) then
    raise exception 'Attachment is invalid or unavailable';
  end if;
  files:=coalesce(a.attachments,'[]'::jsonb)||jsonb_build_array(jsonb_build_object('path',f->>'path','name',f->>'name','mime',f->>'mime','size',(f->>'size')::bigint));
  update public.classroom_assignments set attachments=files where id=a.id;
  return files;
end $$;
create or replace function public.authorize_classroom_assignment_attachment(p_assignment_id uuid,p_path text)
returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.classroom_assignments a where a.id=p_assignment_id and public.cw_access(a.classroom_id) and a.attachments @> jsonb_build_array(jsonb_build_object('path',p_path)))
$$;
create or replace function public.validate_classroom_invite_email(p_invite_id uuid,p_token text)
returns text language sql stable security definer set search_path=public,extensions as $$
 select i.invited_email from public.classroom_invites i
 join public.classrooms c on c.id=i.classroom_id
 where i.id=p_invite_id and public.cw_coach(c.id) and i.invited_by=auth.uid()
   and i.token='sha256:'||encode(digest(p_token,'sha256'),'hex')
   and i.invited_email is not null and i.accepted_uid is null and i.revoked_at is null and i.expires_at>now()
$$;
revoke all on function public.register_classroom_attachments(uuid,jsonb),public.authorize_classroom_attachment(uuid,text),public.register_classroom_assignment_attachment(uuid,jsonb),public.authorize_classroom_assignment_attachment(uuid,text),public.validate_classroom_invite_email(uuid,text) from public,anon;
grant execute on function public.register_classroom_attachments(uuid,jsonb),public.authorize_classroom_attachment(uuid,text),public.register_classroom_assignment_attachment(uuid,jsonb),public.authorize_classroom_assignment_attachment(uuid,text),public.validate_classroom_invite_email(uuid,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Classroom attachment owners and coaches can read') then
    create policy "Classroom attachment owners and coaches can read" on storage.objects for select to authenticated
    using(bucket_id='classroom-attachments' and (
      (storage.foldername(name))[1]=(select auth.uid())::text or exists(
        select 1 from public.classroom_submissions s cross join lateral jsonb_array_elements(s.attachments) f
        join public.classroom_assignments a on a.id=s.assignment_id
        where f->>'path'=storage.objects.name and public.cw_coach(a.classroom_id)) or exists(
        select 1 from public.classroom_assignments a cross join lateral jsonb_array_elements(a.attachments) f
        where f->>'path'=storage.objects.name and public.cw_access(a.classroom_id))));
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Classroom attachment owners can upload') then
    create policy "Classroom attachment owners can upload" on storage.objects for insert to authenticated
    with check(bucket_id='classroom-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text and exists(
      select 1 from public.classroom_assignments a where a.id::text=(storage.foldername(name))[2]
      and (public.cw_coach(a.classroom_id) or (a.allow_files and public.cw_access(a.classroom_id)))));
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Classroom attachment owners can update') then
    create policy "Classroom attachment owners can update" on storage.objects for update to authenticated
    using(bucket_id='classroom-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text)
    with check(bucket_id='classroom-attachments' and (storage.foldername(name))[1]=(select auth.uid())::text);
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='Classroom attachment owners can delete') then
    create policy "Classroom attachment owners can delete" on storage.objects for delete to authenticated
    using(bucket_id='classroom-attachments' and ((storage.foldername(name))[1]=(select auth.uid())::text or exists(
      select 1 from public.classroom_submissions s cross join lateral jsonb_array_elements(s.attachments) f join public.classroom_assignments a on a.id=s.assignment_id where f->>'path'=storage.objects.name and public.cw_coach(a.classroom_id)) or exists(
      select 1 from public.classroom_assignments a cross join lateral jsonb_array_elements(a.attachments) f where f->>'path'=storage.objects.name and public.cw_coach(a.classroom_id))));
  end if;
end $$;

notify pgrst,'reload schema';
