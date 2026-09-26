-- Classroom v2. Preserve 0007/0008 data; retire their unsafe public RPC surface.
begin;
create extension if not exists pgcrypto;
set search_path = public, extensions;
alter table public.organizations add column if not exists archived boolean not null default false;
alter table public.classrooms add column if not exists updated_at timestamptz not null default now();
alter table public.classroom_assignments drop constraint if exists classroom_assignments_kind_check;
alter table public.classroom_assignments add constraint classroom_assignments_kind_check check(kind in ('debate','ai_debate','live_debate','private_debate','written_debate','drill','position_paper'));
alter table public.classroom_assignments add column if not exists status text not null default 'published' check(status in ('draft','published'));
alter table public.classroom_assignments add column if not exists max_score numeric not null default 100 check(max_score > 0 and max_score <= 10000);
alter table public.classroom_assignments add column if not exists allow_late boolean not null default false;
alter table public.classroom_assignments add column if not exists allow_files boolean not null default false;
alter table public.classroom_assignments add column if not exists student_replies boolean not null default true;
alter table public.classroom_assignments add column if not exists rubric jsonb not null default '[{"name":"Argument and reasoning","max":20},{"name":"Evidence and research","max":20},{"name":"Structure and clarity","max":20},{"name":"Rebuttal and responsiveness","max":20},{"name":"Diplomacy and delivery","max":20}]';
alter table public.classroom_assignments add column if not exists updated_at timestamptz not null default now();
alter table public.classroom_submissions drop constraint if exists classroom_submissions_score_check;
alter table public.classroom_submissions alter column score type numeric;
alter table public.classroom_submissions add column if not exists request_id uuid;
create unique index if not exists classroom_submission_request on public.classroom_submissions(student_uid,request_id);
alter table public.classroom_submissions add column if not exists state text not null default 'submitted' check(state in ('submitted','late','graded','returned','resubmission-requested'));
alter table public.classroom_submissions add column if not exists rubric_scores jsonb not null default '{}';
alter table public.classroom_submissions add column if not exists activity jsonb;
alter table public.classroom_submissions add column if not exists version integer not null default 1;
update public.classroom_submissions set state='graded' where graded_at is not null and state='submitted';
alter table public.classroom_invites add column if not exists revoked_at timestamptz;
alter table public.classroom_invites add column if not exists role text not null default 'student' check(role in ('coach','student'));
-- Prefix makes the conversion safe to rerun; existing raw links remain usable.
update public.classroom_invites set token='sha256:'||encode(digest(token,'sha256'),'hex') where token not like 'sha256:%';

create table if not exists public.classroom_drafts (
 assignment_id uuid references public.classroom_assignments on delete cascade,
 user_id uuid references auth.users on delete cascade, content text not null check(length(content)<=30000),
 updated_at timestamptz not null default now(), primary key(assignment_id,user_id));
create table if not exists public.classroom_grade_drafts (
 submission_id uuid primary key references public.classroom_submissions on delete cascade,
 data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.classroom_announcements (
 id uuid primary key default gen_random_uuid(), classroom_id uuid not null references public.classrooms on delete cascade,
 title text not null check(length(trim(title)) between 2 and 120), body text not null check(length(body) between 1 and 8000),
 pinned boolean not null default false, assignment_id uuid references public.classroom_assignments on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.classroom_reads (
 classroom_id uuid references public.classrooms on delete cascade,user_id uuid references auth.users on delete cascade,
 read_at timestamptz not null default now(),primary key(classroom_id,user_id));
create table if not exists public.classroom_questions (
 id uuid primary key default gen_random_uuid(), assignment_id uuid not null references public.classroom_assignments on delete cascade,
 user_id uuid not null references auth.users on delete cascade,body text not null check(length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now());
create table if not exists public.classroom_audit (
 id bigint generated always as identity primary key, actor uuid not null references auth.users,
 action text not null, target uuid, created_at timestamptz not null default now());
create index if not exists classroom_audit_rate on public.classroom_audit(actor,action,created_at);

create or replace function public.cw_coach(cid uuid) returns boolean language sql stable security definer set search_path=public,extensions as $$
 select exists(select 1 from public.classrooms c where c.id=cid and (c.owner_uid=auth.uid() or exists(select 1 from public.classroom_members m where m.classroom_id=c.id and m.user_id=auth.uid() and m.role='coach')))
$$;
create or replace function public.cw_access(cid uuid) returns boolean language sql stable security definer set search_path=public,extensions as $$
 select public.cw_coach(cid) or exists(select 1 from public.classroom_members m where m.classroom_id=cid and m.user_id=auth.uid())
$$;
-- Remove ALL old policies on classroom tables so permissive policies cannot bypass the new checks.
do $$ declare r record; begin
 for r in select p.tablename,p.policyname from pg_policies p where p.schemaname='public' and (p.tablename like 'classroom%' or p.tablename in ('organizations','organization_members')) loop
 execute format('drop policy %I on public.%I',r.policyname,r.tablename); end loop;
 for r in select t.tablename from pg_tables t where t.schemaname='public' and (t.tablename like 'classroom%' or t.tablename in ('organizations','organization_members')) loop
 execute format('alter table public.%I enable row level security',r.tablename);
 execute format('revoke all on public.%I from anon, authenticated',r.tablename);
 end loop;
end $$;
grant select on public.classrooms,public.classroom_members,public.classroom_assignments,public.classroom_submissions,public.organizations,public.organization_members to authenticated;
create policy cw_read on public.classrooms for select to authenticated using(public.cw_access(id));
create policy cw_read on public.classroom_members for select to authenticated using(public.cw_coach(classroom_id) or (user_id=auth.uid() and public.cw_access(classroom_id)));
create policy cw_read on public.classroom_assignments for select to authenticated using(public.cw_coach(classroom_id) or (public.cw_access(classroom_id) and status='published' and not archived));
create policy cw_read on public.classroom_submissions for select to authenticated using(exists(select 1 from public.classroom_assignments a where a.id=assignment_id and (public.cw_coach(a.classroom_id) or (student_uid=auth.uid() and public.cw_access(a.classroom_id)))));
create policy cw_read on public.organizations for select to authenticated using(owner_uid=auth.uid() or public.is_organization_member(id));
create policy cw_read on public.organization_members for select to authenticated using(user_id=auth.uid() or public.is_organization_owner(organization_id));

-- One explicitly checked command surface. All arguments are typed or validated;
-- no dynamic SQL is derived from the payload. All writes are atomic.
create or replace function public.classroom_command(p_action text,p_data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
 u uuid:=auth.uid(); cid uuid:=nullif(p_data->>'cohort','')::uuid; aid uuid:=nullif(p_data->>'assignment','')::uuid;
 oid uuid:=nullif(p_data->>'organization','')::uuid; sid uuid:=nullif(p_data->>'submission','')::uuid;
 target uuid:=nullif(p_data->>'user','')::uuid; rid uuid:=nullif(p_data->>'id','')::uuid;
 a public.classroom_assignments%rowtype; c public.classrooms%rowtype; s public.classroom_submissions%rowtype;
 inv public.classroom_invites%rowtype; token_value text; n integer; result jsonb; item jsonb; total numeric; score_value numeric;
begin
 if u is null then raise exception 'Sign in to use Classroom'; end if;
 if octet_length(p_data::text)>150000 then raise exception 'Request too large'; end if;
 -- Serialize a user's writes (idempotency, generation limits, attempts).
 if p_action<>'workspace' then perform pg_advisory_xact_lock(hashtextextended(u::text,19)); end if;
 if p_action='workspace' then
  select jsonb_build_object('user',u,
   'organizations',coalesce((select jsonb_agg(to_jsonb(o)) from public.organizations o where o.owner_uid=u or public.is_organization_member(o.id)),'[]'),
   -- Use cr here: the PL/pgSQL record variable c below must not share the table alias.
   'cohorts',coalesce((select jsonb_agg(to_jsonb(x)) from (select cr.*,public.cw_coach(cr.id) as coach,
    (select count(*) from public.classroom_members m where m.classroom_id=cr.id and m.role='student') students,
    (select o.name from public.organizations o where o.id=cr.organization_id) organization_name
    from public.classrooms cr where public.cw_access(cr.id)) x),'[]'),
   'assignments',coalesce((select jsonb_agg(to_jsonb(asg)) from public.classroom_assignments asg where public.cw_coach(asg.classroom_id) or (public.cw_access(asg.classroom_id) and asg.status='published' and not asg.archived)),'[]'),
   'submissions',coalesce((select jsonb_agg(to_jsonb(sub)) from public.classroom_submissions sub join public.classroom_assignments asg on asg.id=sub.assignment_id where public.cw_coach(asg.classroom_id) or (public.cw_access(asg.classroom_id) and sub.student_uid=u and asg.status='published' and not asg.archived)),'[]'),
   'drafts',coalesce((select jsonb_agg(to_jsonb(dr)) from public.classroom_drafts dr join public.classroom_assignments asg on asg.id=dr.assignment_id where dr.user_id=u and public.cw_access(asg.classroom_id) and asg.status='published' and not asg.archived),'[]'),
   'grade_drafts',coalesce((select jsonb_agg(to_jsonb(gd)) from public.classroom_grade_drafts gd join public.classroom_submissions sub on sub.id=gd.submission_id join public.classroom_assignments asg on asg.id=sub.assignment_id where public.cw_coach(asg.classroom_id)),'[]'),
   'members',coalesce((select jsonb_agg(to_jsonb(x)) from(select m.*,coalesce(p.display_name,'Member') display_name from public.classroom_members m left join public.profiles p on p.uid=m.user_id where public.cw_coach(m.classroom_id) or (m.user_id=u and public.cw_access(m.classroom_id))) x),'[]'),
   'announcements',coalesce((select jsonb_agg(to_jsonb(ann)) from public.classroom_announcements ann where public.cw_access(ann.classroom_id)),'[]'),
   'reads',coalesce((select jsonb_agg(to_jsonb(r)) from public.classroom_reads r where r.user_id=u and public.cw_access(r.classroom_id)),'[]'),
   'questions',coalesce((select jsonb_agg(to_jsonb(qn)) from public.classroom_questions qn join public.classroom_assignments asg on asg.id=qn.assignment_id where public.cw_coach(asg.classroom_id) or (public.cw_access(asg.classroom_id) and asg.status='published' and not asg.archived)),'[]'),
   'invites',coalesce((select jsonb_agg(to_jsonb(i)-'token') from public.classroom_invites i where public.cw_coach(i.classroom_id)),'[]')) into result;
  return result;
 end if;
 if p_action='organization' then
  if oid is null then
   insert into public.organizations(owner_uid,name) values(u,trim(p_data->>'name')) returning id into oid;
   insert into public.organization_members values(oid,u,'coach',now());
  else
   if not public.is_organization_owner(oid) then raise exception 'Only the organisation owner can edit it'; end if;
   update public.organizations set name=trim(p_data->>'name'),archived=coalesce((p_data->>'archived')::boolean,false) where id=oid;
  end if;
  result:=jsonb_build_object('id',oid);
 elsif p_action='cohort' and cid is null then
  if oid is not null and not exists(select 1 from public.organizations o where o.id=oid and not o.archived and (o.owner_uid=u or exists(select 1 from public.organization_members m where m.organization_id=o.id and m.user_id=u and m.role='coach'))) then raise exception 'Organisation unavailable'; end if;
  insert into public.classrooms(owner_uid,name,description,organization_id,invite_code) values(u,trim(p_data->>'name'),coalesce(p_data->>'description',''),oid,public.veritas_new_invite_code()) returning id into cid;
  insert into public.classroom_members values(cid,u,'coach',now()); result:=jsonb_build_object('id',cid);
 elsif p_action='join' then
  if (select count(*) from public.classroom_audit x where x.actor=u and x.action='join' and x.created_at>now()-interval '1 hour')>=30 then raise exception 'Join limit reached; try again later'; end if;
  if nullif(p_data->>'token','') is not null then
   select i.* into inv from public.classroom_invites i where i.token='sha256:'||encode(digest(p_data->>'token','sha256'),'hex') for update;
   if not found or inv.revoked_at is not null or inv.expires_at<=now() or (inv.accepted_uid is not null and inv.accepted_uid<>u) then raise exception 'Invitation invalid, expired or already accepted'; end if;
   if inv.invited_email is not null and inv.invited_email<>lower(coalesce((select email from auth.users where id=u),'')) then raise exception 'Sign in using the invited email address'; end if;
   cid:=inv.classroom_id;
  else
   select x.id into cid from public.classrooms x where x.invite_code=upper(trim(p_data->>'code'));
  end if;
  select * into c from public.classrooms x where x.id=cid for update;
  if not found or c.archived or exists(select 1 from public.organizations o where o.id=c.organization_id and o.archived) then raise exception 'Cohort unavailable'; end if;
  insert into public.classroom_members values(cid,u,coalesce(inv.role,'student'),now()) on conflict do nothing;
  if c.organization_id is not null then insert into public.organization_members values(c.organization_id,u,'student',now()) on conflict do nothing; end if;
  if inv.id is not null then update public.classroom_invites set accepted_uid=u where id=inv.id; end if;
  result:=jsonb_build_object('id',cid);
 else
  if aid is not null then select * into a from public.classroom_assignments x where x.id=aid; if not found then raise exception 'Assignment no longer exists'; end if; cid:=a.classroom_id; end if;
  if sid is not null then
   select * into s from public.classroom_submissions x where x.id=sid for update;
   if not found then raise exception 'Submission no longer exists'; end if;
   select * into a from public.classroom_assignments x where x.id=s.assignment_id; cid:=a.classroom_id;
  end if;
  select * into c from public.classrooms x where x.id=cid for update;
  if not found or not public.cw_access(cid) then raise exception 'Cohort access denied'; end if;
  if (c.archived or exists(select 1 from public.organizations o where o.id=c.organization_id and o.archived)) and p_action not in ('cohort','leave') then raise exception 'This cohort or organisation is archived'; end if;
  if p_action not in ('draft','submit','question','read','leave') and not public.cw_coach(cid) then raise exception 'Coach access required'; end if;
  if p_action='cohort' then
   if coalesce((p_data->>'delete')::boolean,false) then
    if exists(select 1 from public.classroom_members m where m.classroom_id=cid and m.user_id<>u) or exists(select 1 from public.classroom_assignments x where x.classroom_id=cid) then raise exception 'Only empty cohorts can be deleted'; end if;
    delete from public.classrooms where id=cid;
   else update public.classrooms set name=trim(p_data->>'name'),description=coalesce(p_data->>'description',''),archived=coalesce((p_data->>'archived')::boolean,false),archived_at=case when (p_data->>'archived')::boolean then now() end,updated_at=now() where id=cid; end if;
  elsif p_action in ('member','leave') then
   if p_action='leave' then target:=u; end if;
   if target=c.owner_uid then raise exception 'The cohort owner cannot be removed or demoted'; end if;
   if p_action='leave' or p_data->>'role'='remove' then delete from public.classroom_members where classroom_id=cid and user_id=target;
   else
    if c.owner_uid<>u and not public.is_organization_owner(c.organization_id) then raise exception 'Only the owner can change coach roles'; end if;
    update public.classroom_members set role=p_data->>'role' where classroom_id=cid and user_id=target;
   end if;
  elsif p_action='invite' then
   if (select count(*) from public.classroom_audit x where x.actor=u and x.action='invite' and x.created_at>now()-interval '1 hour')>=40 then raise exception 'Invitation limit reached (40 per hour)'; end if;
   if p_data->>'role'='coach' and c.owner_uid<>u and not public.is_organization_owner(c.organization_id) then raise exception 'Only the owner can invite coaches'; end if;
   if (p_data->>'expires')::timestamptz<=now() or (p_data->>'expires')::timestamptz>now()+interval '90 days' then raise exception 'Choose expiry within the next 90 days'; end if;
   token_value:=encode(gen_random_bytes(32),'hex');
   insert into public.classroom_invites(classroom_id,invited_email,token,invited_by,expires_at,role) values(cid,nullif(lower(trim(p_data->>'email')),''),'sha256:'||encode(digest(token_value,'sha256'),'hex'),u,(p_data->>'expires')::timestamptz,coalesce(p_data->>'role','student')) returning id into rid;
   result:=jsonb_build_object('id',rid,'token',token_value);
  elsif p_action='revoke' then update public.classroom_invites set revoked_at=now() where id=rid and classroom_id=cid and accepted_uid is null;
  elsif p_action='assignment' then
   if p_data->>'operation'='delete' then
    if exists(select 1 from public.classroom_submissions x where x.assignment_id=aid) then raise exception 'Archive assignments with submissions to preserve work'; end if;
    delete from public.classroom_assignments where id=aid;
   elsif p_data->>'operation'='archive' then update public.classroom_assignments set archived=not archived,updated_at=now() where id=aid;
   else
    if jsonb_typeof(p_data->'rubric')<>'array' or jsonb_array_length(p_data->'rubric') not between 1 and 12 then raise exception 'Provide 1-12 rubric categories'; end if;
    total:=0; for item in select value from jsonb_array_elements(p_data->'rubric') loop
     if length(trim(item->>'name')) not between 1 and 100 or (item->>'max')::numeric<=0 then raise exception 'Invalid rubric category'; end if; total:=total+(item->>'max')::numeric;
    end loop;
    if total<>(p_data->>'max_score')::numeric then raise exception 'Rubric points must total the maximum score'; end if;
    if aid is null then
     insert into public.classroom_assignments(classroom_id,created_by,kind,title,status) values(cid,u,p_data->>'kind',trim(p_data->>'title'),'draft') returning id into aid;
    end if;
    update public.classroom_assignments set kind=p_data->>'kind',title=trim(p_data->>'title'),instructions=coalesce(p_data->>'instructions',''),status=p_data->>'status',due_at=nullif(p_data->>'due_at','')::timestamptz,attempt_limit=(p_data->>'attempt_limit')::int,max_score=total,rubric=p_data->'rubric',allow_late=(p_data->>'allow_late')::boolean,allow_files=(p_data->>'allow_files')::boolean,student_replies=(p_data->>'student_replies')::boolean,updated_at=now() where id=aid;
    result:=jsonb_build_object('id',aid);
   end if;
  elsif p_action in ('draft','submit','question') then
   if a.id is null or a.archived or (a.status<>'published' and not public.cw_coach(cid)) then raise exception 'Assignment unavailable'; end if;
   if p_action='question' then
    if not a.student_replies and not public.cw_coach(cid) then raise exception 'Student replies are disabled'; end if;
    insert into public.classroom_questions(assignment_id,user_id,body) values(aid,u,p_data->>'body');
   else
    if public.cw_coach(cid) then raise exception 'Student membership required to submit'; end if;
    if p_action='draft' then insert into public.classroom_drafts values(aid,u,coalesce(p_data->>'content',''),now()) on conflict(assignment_id,user_id) do update set content=excluded.content,updated_at=now();
    else
     if nullif(p_data->>'request_id','') is null then raise exception 'Submission request ID required'; end if;
     select * into s from public.classroom_submissions x where x.student_uid=u and x.request_id=(p_data->>'request_id')::uuid;
     if found then return to_jsonb(s); end if;
     if a.due_at<now() and not a.allow_late then raise exception 'The deadline has passed; late work is disabled'; end if;
     select coalesce(max(x.attempt_no),0)+1 into n from public.classroom_submissions x where x.assignment_id=aid and x.student_uid=u;
     if n>a.attempt_limit then raise exception 'Attempt limit reached'; end if;
     item:=p_data->'activity';
     if a.kind in ('live_debate','private_debate') then
      select to_jsonb(d) into item from public.debates d where d.id=(p_data->'activity'->>'id')::uuid and u=any(d.players) and d.status='completed';
      if item is null then raise exception 'Complete your live debate first'; end if;
     end if;
     if a.kind='ai_debate' and (item is null or jsonb_array_length(coalesce(item->'transcript','[]'))=0) then raise exception 'Complete the AI debate first'; end if;
     insert into public.classroom_submissions(assignment_id,student_uid,attempt_no,content,request_id,state,activity) values(aid,u,n,trim(p_data->>'content'),(p_data->>'request_id')::uuid,case when a.due_at<now() then 'late' else 'submitted' end,item) returning to_jsonb(classroom_submissions.*) into result;
     delete from public.classroom_drafts where assignment_id=aid and user_id=u;
    end if;
   end if;
  elsif p_action='grade' then
   if s.version<>(p_data->>'version')::integer then raise exception 'Another coach changed this submission. Refresh before saving.'; end if;
   score_value:=(p_data->>'score')::numeric;
   if score_value is null or score_value<0 or score_value>a.max_score or length(coalesce(p_data->>'feedback',''))>4000 then raise exception 'Invalid score or feedback'; end if;
   total:=0; for item in select value from jsonb_array_elements(a.rubric) loop
    if not (p_data->'rubric_scores' ? (item->>'name')) or (p_data->'rubric_scores'->>(item->>'name'))::numeric not between 0 and (item->>'max')::numeric then raise exception 'Complete every rubric category within its range'; end if;
    total:=total+(p_data->'rubric_scores'->>(item->>'name'))::numeric;
   end loop;
   if total<>score_value then raise exception 'Score must equal rubric total'; end if;
   update public.classroom_submissions set version=version+1 where id=sid;
   if p_data->>'mode'='draft' then insert into public.classroom_grade_drafts values(sid,p_data,now()) on conflict(submission_id) do update set data=excluded.data,updated_at=now();
   else
    update public.classroom_submissions set score=score_value,feedback=coalesce(p_data->>'feedback',''),rubric_scores=p_data->'rubric_scores',state=p_data->>'mode',graded_by=u,graded_at=now() where id=sid;
    delete from public.classroom_grade_drafts where submission_id=sid;
   end if;
  elsif p_action='announcement' then
   if aid is not null and a.classroom_id<>cid then raise exception 'Assignment must belong to this cohort'; end if;
   if p_data->>'operation'='delete' then delete from public.classroom_announcements where id=rid and classroom_id=cid;
   elsif rid is null then insert into public.classroom_announcements(classroom_id,title,body,pinned,assignment_id) values(cid,p_data->>'title',p_data->>'body',coalesce((p_data->>'pinned')::boolean,false),aid);
   else update public.classroom_announcements set title=p_data->>'title',body=p_data->>'body',pinned=coalesce((p_data->>'pinned')::boolean,false),assignment_id=aid,updated_at=now() where id=rid and classroom_id=cid; end if;
  elsif p_action='moderate' then delete from public.classroom_questions where id=rid and assignment_id in(select x.id from public.classroom_assignments x where x.classroom_id=cid);
  elsif p_action='read' then insert into public.classroom_reads values(cid,u,now()) on conflict(classroom_id,user_id) do update set read_at=now();
  else raise exception 'Unknown classroom operation'; end if;
 end if;
 if p_action not in ('draft','read') then insert into public.classroom_audit(actor,action,target) values(u,p_action,coalesce(sid,aid,cid,oid)); end if;
 return coalesce(result,'{}');
end $$;

-- Old definer functions bypass new publication/expiry/role rules. Retain definitions
-- for data compatibility, but retire execution for all client roles.
do $$ declare r record; begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname in ('create_organization','list_my_organizations','create_cohort','veritas_new_invite_code') or p.proname like '%classroom%') loop
 execute format('revoke execute on function %s from public, anon, authenticated',r.signature); end loop;
end $$;
revoke all on function public.cw_coach(uuid),public.cw_access(uuid),public.is_organization_member(uuid),public.is_organization_owner(uuid) from public,anon;
grant execute on function public.cw_coach(uuid),public.cw_access(uuid),public.is_organization_member(uuid),public.is_organization_owner(uuid),public.classroom_command(text,jsonb) to authenticated;
commit;
notify pgrst, 'reload schema';
