create table public.account_deletion_requests (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','cancelled','completed')),
 requested_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 operator_note text not null default ''
);
alter table public.account_deletion_requests enable row level security;
revoke all on public.account_deletion_requests from public,anon,authenticated;
grant select(owner_id,status,requested_at,updated_at) on public.account_deletion_requests to authenticated;
grant all on public.account_deletion_requests to service_role;
create policy deletion_request_read_own on public.account_deletion_requests for select to authenticated using(owner_id=(select auth.uid()));
create or replace function public.request_my_account_deletion(p_confirm text) returns jsonb
language plpgsql security definer set search_path=public,pg_catalog as $$
declare u uuid:=auth.uid(); result jsonb;
begin
 if u is null or p_confirm is distinct from 'REQUEST ACCOUNT DELETION' then raise exception 'Confirm the account deletion request'; end if;
 insert into public.account_deletion_requests(owner_id) values(u)
 on conflict(owner_id) do update set status=case when account_deletion_requests.status='cancelled' then 'pending' else account_deletion_requests.status end,
 requested_at=case when account_deletion_requests.status='cancelled' then now() else account_deletion_requests.requested_at end,updated_at=now();
 select jsonb_build_object('status',status,'requested_at',requested_at) into result from public.account_deletion_requests where owner_id=u;
 return result;
end $$;
create or replace function public.cancel_my_account_deletion() returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 update public.account_deletion_requests set status='cancelled',updated_at=now() where owner_id=auth.uid() and status='pending';
end $$;
revoke all on function public.request_my_account_deletion(text), public.cancel_my_account_deletion() from public,anon;
grant execute on function public.request_my_account_deletion(text), public.cancel_my_account_deletion() to authenticated;

-- Exports use a fixed collection allowlist and have no caller-supplied owner ID.
-- Binary storage objects are intentionally not embedded in JSON exports.
create or replace function public.export_my_account_records(p_collection text,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path=public,pg_catalog as $$
declare u uuid:=auth.uid(); records jsonb; result jsonb;
begin
 if u is null then raise exception 'Sign in first'; end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid export offset'; end if;
 if p_collection='profile' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.profiles where uid=u order by uid limit 101 offset p_offset) t;
 elsif p_collection='debates' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.debates where u=any(players) order by created_at,id limit 101 offset p_offset) t;
 elsif p_collection='submissions' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classroom_submissions where student_uid=u order by submitted_at,id limit 101 offset p_offset) t;
 elsif p_collection='discussions' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classroom_questions where user_id=u order by created_at,id limit 101 offset p_offset) t;
 elsif p_collection='drafts' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classroom_drafts where user_id=u order by assignment_id limit 101 offset p_offset) t;
 elsif p_collection='classroom_memberships' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classroom_members where user_id=u order by classroom_id limit 101 offset p_offset) t;
 elsif p_collection='organization_memberships' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.organization_members where user_id=u order by organization_id limit 101 offset p_offset) t;
 elsif p_collection='library' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.learning_libraries where owner_id=u order by owner_id limit 101 offset p_offset) t;
 elsif p_collection='blocks' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.player_blocks where owner_id=u order by target_id limit 101 offset p_offset) t;
 elsif p_collection='reports' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.debate_reports where reporter_id=u order by created_at,id limit 101 offset p_offset) t;
 elsif p_collection='owned_classrooms' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classrooms where owner_uid=u order by created_at,id limit 101 offset p_offset) t;
 elsif p_collection='owned_organizations' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.organizations where owner_uid=u order by created_at,id limit 101 offset p_offset) t;
 elsif p_collection='recordings' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.debate_recordings where owner_uid=u order by created_at,path limit 101 offset p_offset) t;
 elsif p_collection='private_rooms' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.private_debate_rooms where host_uid=u or guest_uid=u order by created_at,id limit 101 offset p_offset) t;
 elsif p_collection='created_assignments' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classroom_assignments where created_by=u order by created_at,id limit 101 offset p_offset) t;
 elsif p_collection='account_requests' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select owner_id,status,requested_at,updated_at from public.account_deletion_requests where owner_id=u order by owner_id limit 101 offset p_offset) t;
 elsif p_collection='audit_events' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classroom_audit where actor=u order by id limit 101 offset p_offset) t;
 elsif p_collection='read_receipts' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classroom_reads where user_id=u order by classroom_id limit 101 offset p_offset) t;
 else raise exception 'Unknown export collection'; end if;
 select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb) into result from jsonb_array_elements(records) with ordinality as entries(value,ordinal) where ordinal<=100;
 return jsonb_build_object('records',result,'has_more',jsonb_array_length(records)>100,'next_offset',p_offset+100);
end $$;
revoke all on function public.export_my_account_records(text,integer) from public,anon;
grant execute on function public.export_my_account_records(text,integer) to authenticated;
