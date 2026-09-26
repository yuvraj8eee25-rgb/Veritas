-- Make Classroom invites and grading safe to retry after a dropped response.
begin;

alter table public.classroom_invites
  add column if not exists request_id uuid;

create unique index if not exists classroom_invite_request
  on public.classroom_invites(invited_by, request_id)
  where request_id is not null;

create table if not exists public.classroom_grade_idempotency (
  submission_id uuid primary key references public.classroom_submissions(id) on delete cascade,
  request_id uuid not null,
  request_hash text not null,
  updated_at timestamptz not null default now()
);
alter table public.classroom_grade_idempotency enable row level security;
revoke all on public.classroom_grade_idempotency from public,anon,authenticated;

-- Grading writes use a separate additive RPC so a lost response can be retried
-- without turning a committed grade into a stale-version error.
create or replace function public.grade_classroom_submission_idempotent(
  p_submission_id uuid,
  p_data jsonb
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  u uuid:=auth.uid();
  s public.classroom_submissions%rowtype;
  request_record public.classroom_grade_idempotency%rowtype;
  a public.classroom_assignments%rowtype;
  c public.classrooms%rowtype;
  request_value uuid;
  request_hash text;
  score_value numeric;
  total numeric:=0;
  item jsonb;
begin
  if u is null then raise exception 'Sign in to grade submissions'; end if;
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>20000 then
    raise exception 'Invalid grading request';
  end if;
  if nullif(p_data->>'request_id','') is null then raise exception 'Grading request ID required'; end if;
  request_value:=(p_data->>'request_id')::uuid;
  request_hash:=encode(digest(jsonb_build_object(
    'version',p_data->'version','score',p_data->'score',
    'rubric_scores',p_data->'rubric_scores','feedback',p_data->'feedback','mode',p_data->'mode'
  )::text,'sha256'),'hex');

  perform pg_advisory_xact_lock(hashtextextended(u::text,19));
  select * into s from public.classroom_submissions where id=p_submission_id for update;
  if not found then raise exception 'Submission no longer exists'; end if;
  select * into a from public.classroom_assignments where id=s.assignment_id;
  select * into c from public.classrooms where id=a.classroom_id;
  if not public.cw_coach(a.classroom_id) then raise exception 'Coach access required'; end if;
  if c.archived or exists(select 1 from public.organizations o where o.id=c.organization_id and o.archived) then
    raise exception 'This cohort or organisation is archived';
  end if;

  select * into request_record from public.classroom_grade_idempotency where submission_id=s.id for update;
  if request_record.request_id=request_value then
    if request_record.request_hash is distinct from request_hash then
      raise exception 'Grading retry does not match the original request';
    end if;
    return to_jsonb(s);
  end if;

  if s.version is distinct from (p_data->>'version')::integer then
    raise exception 'Another coach changed this submission. Refresh before saving.';
  end if;
  score_value:=(p_data->>'score')::numeric;
  if score_value is null or score_value<0 or score_value>a.max_score
     or length(coalesce(p_data->>'feedback',''))>4000
     or p_data->>'mode' is null
     or p_data->>'mode' not in ('draft','graded','returned','resubmission-requested')
     or jsonb_typeof(p_data->'rubric_scores') is distinct from 'object' then
    raise exception 'Invalid score, feedback, rubric or grading action';
  end if;
  for item in select value from jsonb_array_elements(a.rubric) loop
    if not (p_data->'rubric_scores' ? (item->>'name'))
       or (p_data->'rubric_scores'->>(item->>'name'))::numeric not between 0 and (item->>'max')::numeric then
      raise exception 'Complete every rubric category within its range';
    end if;
    total:=total+(p_data->'rubric_scores'->>(item->>'name'))::numeric;
  end loop;
  if total<>score_value then raise exception 'Score must equal rubric total'; end if;

  update public.classroom_submissions
    set version=version+1
    where id=s.id returning * into s;
  if p_data->>'mode'='draft' then
    insert into public.classroom_grade_drafts(submission_id,data,updated_at)
      values(s.id,p_data-'request_id',now())
      on conflict(submission_id) do update set data=excluded.data,updated_at=now();
  else
    update public.classroom_submissions
      set score=score_value,feedback=coalesce(p_data->>'feedback',''),
          rubric_scores=p_data->'rubric_scores',state=p_data->>'mode',graded_by=u,graded_at=now()
      where id=s.id returning * into s;
    delete from public.classroom_grade_drafts where submission_id=s.id;
  end if;
  insert into public.classroom_grade_idempotency(submission_id,request_id,request_hash,updated_at)
    values(s.id,request_value,request_hash,now())
    on conflict(submission_id) do update set request_id=excluded.request_id,
      request_hash=excluded.request_hash,updated_at=now();
  insert into public.classroom_audit(actor,action,target) values(u,'grade',s.id);
  return to_jsonb(s);
end $$;

revoke all on function public.grade_classroom_submission_idempotent(uuid,jsonb) from public,anon;
grant execute on function public.grade_classroom_submission_idempotent(uuid,jsonb) to authenticated;

create or replace function public.create_classroom_invite_idempotent(
  p_classroom_id uuid,
  p_email text,
  p_role text,
  p_expires timestamptz,
  p_request_id uuid,
  p_token text
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  u uuid:=auth.uid();
  c public.classrooms%rowtype;
  existing public.classroom_invites%rowtype;
  normalized_email text:=nullif(lower(trim(p_email)), '');
  invite_id uuid;
begin
  if u is null then raise exception 'Sign in to create invitations'; end if;
  if p_request_id is null or p_token is null or p_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid invitation request';
  end if;
  if p_role not in ('coach','student') then raise exception 'Invalid invitation role'; end if;
  if normalized_email is not null and normalized_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Enter a valid email address';
  end if;

  -- Match classroom_command's per-user write serialization before checking the
  -- idempotency key, so simultaneous retries cannot create duplicate rows.
  perform pg_advisory_xact_lock(hashtextextended(u::text,19));
  select * into c from public.classrooms where id=p_classroom_id for update;
  if not found or not public.cw_access(p_classroom_id) or not public.cw_coach(p_classroom_id)
     or c.archived or exists(select 1 from public.organizations o where o.id=c.organization_id and o.archived) then
    raise exception 'Coach access required';
  end if;
  if p_role='coach' and c.owner_uid<>u and not public.is_organization_owner(c.organization_id) then
    raise exception 'Only the owner can invite coaches';
  end if;
  if p_expires<=now() or p_expires>now()+interval '90 days' then
    raise exception 'Choose expiry within the next 90 days';
  end if;

  select * into existing from public.classroom_invites
    where invited_by=u and request_id=p_request_id for update;
  if found then
    if existing.classroom_id<>p_classroom_id
       or existing.invited_email is distinct from normalized_email
       or existing.role<>p_role
       or existing.expires_at<>p_expires
       or existing.token<>'sha256:'||encode(digest(p_token,'sha256'),'hex') then
      raise exception 'Invitation retry does not match the original request';
    end if;
    return jsonb_build_object('id',existing.id,'token',p_token);
  end if;

  if (select count(*) from public.classroom_audit x
      where x.actor=u and x.action='invite' and x.created_at>now()-interval '1 hour')>=40 then
    raise exception 'Invitation limit reached (40 per hour)';
  end if;

  insert into public.classroom_invites(classroom_id,invited_email,token,invited_by,expires_at,role,request_id)
    values(p_classroom_id,normalized_email,
      'sha256:'||encode(digest(p_token,'sha256'),'hex'),u,p_expires,p_role,p_request_id)
    returning id into invite_id;
  insert into public.classroom_audit(actor,action,target) values(u,'invite',p_classroom_id);
  return jsonb_build_object('id',invite_id,'token',p_token);
end $$;

revoke all on function public.create_classroom_invite_idempotent(uuid,text,text,timestamptz,uuid,text) from public,anon;
grant execute on function public.create_classroom_invite_idempotent(uuid,text,text,timestamptz,uuid,text) to authenticated;
commit;
notify pgrst, 'reload schema';
