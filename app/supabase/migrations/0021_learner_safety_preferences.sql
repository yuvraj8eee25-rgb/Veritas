begin;
-- No date of birth is collected. Age bands are self-declared, not identity verification.
create table public.learner_safety_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 age_band text not null check(age_band in ('teen','adult')),
 public_match_opt_in boolean not null default false,
 updated_at timestamptz not null default now(),
 check(age_band='adult' or not public_match_opt_in)
);
alter table public.learner_safety_preferences enable row level security;
revoke all on public.learner_safety_preferences from public,anon,authenticated;
grant select on public.learner_safety_preferences to authenticated;
grant all on public.learner_safety_preferences to service_role;
create policy learner_safety_read_own on public.learner_safety_preferences for select to authenticated using(owner_id=(select auth.uid()));
create or replace function public.is_adult_learner(p_uid uuid) returns boolean language sql stable security definer set search_path=public,pg_catalog as $$
 select exists(select 1 from public.learner_safety_preferences where owner_id=p_uid and age_band='adult');
$$;
create or replace function public.public_match_allowed(p_uid uuid) returns boolean language sql stable security definer set search_path=public,pg_catalog as $$
 select exists(select 1 from public.learner_safety_preferences where owner_id=p_uid and age_band='adult' and public_match_opt_in);
$$;
revoke all on function public.is_adult_learner(uuid),public.public_match_allowed(uuid) from public,anon,authenticated;
create or replace function public.save_my_safety_preferences(p_age_band text,p_public_match_opt_in boolean default false) returns void
language plpgsql security definer set search_path=public,pg_catalog as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Sign in first'; end if;
 if p_age_band is null or p_age_band not in ('teen','adult') or p_public_match_opt_in is null or (p_age_band='teen' and p_public_match_opt_in) then raise exception 'Choose a valid age band and match preference'; end if;
 perform pg_advisory_xact_lock(1414001);
 insert into public.learner_safety_preferences(owner_id,age_band,public_match_opt_in) values(u,p_age_band,p_public_match_opt_in)
 on conflict(owner_id) do update set age_band=excluded.age_band,public_match_opt_in=excluded.public_match_opt_in,updated_at=now();
 if not public.public_match_allowed(u) then delete from public.match_queue where uid=u and status='waiting'; end if;
end $$;
revoke all on function public.save_my_safety_preferences(text,boolean) from public,anon;
grant execute on function public.save_my_safety_preferences(text,boolean) to authenticated;
create or replace function public.create_private_debate_room(p_assignment_id uuid default null,p_topic text default '',p_settings jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare u uuid:=auth.uid(); a public.classroom_assignments%rowtype; settings jsonb; topic text; room public.private_debate_rooms%rowtype;
begin
 if u is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(1414001);
 if p_assignment_id is null and not public.is_adult_learner(u) then raise exception 'Personal rooms require an adult age-band setting. Teen live practice uses teacher-managed private assignments.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,20));
 if (select count(*) from public.private_debate_rooms where host_uid=u and created_at>now()-interval '1 hour')>=20 then raise exception 'Room limit reached; please wait'; end if;
 settings:=public.training_settings(p_settings); topic:=trim(p_topic);
 if p_assignment_id is not null then
  select * into a from public.classroom_assignments where id=p_assignment_id;
  if not found or not public.cw_access(a.classroom_id) or a.kind<>'private_debate' or a.status<>'published' or a.archived or exists(select 1 from public.classrooms where id=a.classroom_id and archived) then raise exception 'Assignment unavailable'; end if;
  if a.due_at<now() and not a.allow_late then raise exception 'Assignment deadline passed'; end if;
  settings:=public.training_settings(a.activity_settings); topic:=coalesce(nullif(settings->>'topic',''),a.title);
 end if;
 if length(topic) not between 3 and 200 then raise exception 'Provide a motion (3-200 characters)'; end if;
 insert into public.private_debate_rooms(host_uid,assignment_id,topic,settings) values(u,p_assignment_id,topic,settings) returning * into room;
 return to_jsonb(room);
end $$;

create or replace function public.join_private_debate_room(p_code text,p_assignment_id uuid default null) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare u uuid:=auth.uid(); room public.private_debate_rooms%rowtype; a public.classroom_assignments%rowtype; did uuid;
begin
 if u is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(1414001);
 perform pg_advisory_xact_lock(hashtextextended(u::text||':private-room-join',0));
 delete from public.veritas_request_log where user_id=u and action='private-room-join' and requested_at<now()-interval '10 minutes';
 if (select count(*) from public.veritas_request_log where user_id=u and action='private-room-join')>=20 then raise exception 'Too many room attempts. Please wait.'; end if;
 insert into public.veritas_request_log(user_id,action) values(u,'private-room-join');
 select * into room from public.private_debate_rooms where code=upper(trim(p_code)) for update;
 if not found or room.closed then raise exception 'Room unavailable'; end if;
 if room.assignment_id is distinct from p_assignment_id then raise exception 'Open the matching assignment before joining this room'; end if;
 if room.assignment_id is not null then
  select * into a from public.classroom_assignments where id=room.assignment_id;
  if not public.cw_access(a.classroom_id) or a.status<>'published' or a.archived or exists(select 1 from public.classrooms where id=a.classroom_id and archived) then raise exception 'Cohort access denied'; end if;
  if a.due_at<now() and not a.allow_late then raise exception 'Assignment deadline passed'; end if;
 end if;
 if u=room.host_uid then return to_jsonb(room); end if;
 if room.guest_uid=u and room.debate_id is not null then return to_jsonb(room); end if;
 if room.assignment_id is null and (not public.is_adult_learner(u) or not public.is_adult_learner(room.host_uid)) then raise exception 'Personal rooms are for adults. Use a teacher-managed private assignment for teen live practice.'; end if;
 if room.expires_at<now() or room.guest_uid is not null then raise exception 'Room expired or full'; end if;
 insert into public.debates(topic,players,player_order,max_turns_per_player,practice_mode,turn_seconds,speech_seconds,assignment_id,is_private)
 values(room.topic,array[room.host_uid,u],array[room.host_uid,u],(room.settings->>'turns')::int,room.settings->>'mode',(room.settings->>'turn_seconds')::int,(room.settings->>'speech_seconds')::int,room.assignment_id,true) returning id into did;
 update public.private_debate_rooms set guest_uid=u,debate_id=did where id=room.id returning * into room;
 return to_jsonb(room);
end $$;
create or replace function public.join_training_queue(p_topic text default null,p_settings jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); s jsonb;
begin
 if u is null then raise exception 'Sign in first'; end if;
 perform pg_advisory_xact_lock(1414001);
 if not public.public_match_allowed(u) then raise exception 'Public matches require an adult age-band setting and explicit opt-in in Profile. Teens use teacher-managed private assignments.'; end if;
 s:=public.training_settings(p_settings);
 if length(coalesce(p_topic,''))>200 then raise exception 'Motion too long'; end if;
 insert into public.match_queue(uid,topic,practice_mode,speech_seconds,max_turns_per_player) values(u,nullif(trim(p_topic),''),s->>'mode',(s->>'speech_seconds')::int,(s->>'turns')::int)
 on conflict(uid) do update set topic=excluded.topic,practice_mode=excluded.practice_mode,speech_seconds=excluded.speech_seconds,max_turns_per_player=excluded.max_turns_per_player,status='waiting',debate_id=null,created_at=now();
end $$;
create or replace function public.attempt_match(p_fallback_topic text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); mine public.match_queue%rowtype; candidate public.match_queue%rowtype; did uuid;
begin
 if u is null then raise exception 'Sign in first'; end if;
 -- Serialize match creation to avoid opposing clients locking each other's queue rows.
 perform pg_advisory_xact_lock(1414001);
 select * into mine from public.match_queue where uid=u for update;
 if not found then return null; end if;
 if mine.status='matched' then return mine.debate_id; end if;
 if not public.public_match_allowed(u) then delete from public.match_queue where uid=u and status='waiting'; return null; end if;
 select * into candidate from public.match_queue q where public.public_match_allowed(q.uid) and not exists(select 1 from public.player_blocks b where (b.owner_id=u and b.target_id=q.uid) or (b.owner_id=q.uid and b.target_id=u)) and status='waiting' and uid<>u and practice_mode=mine.practice_mode and speech_seconds=mine.speech_seconds and max_turns_per_player=mine.max_turns_per_player and (mine.topic is null or topic is null or topic=mine.topic) order by created_at limit 1 for update;
 if not found then return null; end if;
 insert into public.debates(topic,players,player_order,max_turns_per_player,practice_mode,turn_seconds,speech_seconds)
 values(left(coalesce(candidate.topic,mine.topic,p_fallback_topic,'Open topic'),200),array[candidate.uid,u],array[candidate.uid,u],mine.max_turns_per_player,mine.practice_mode,case when mine.practice_mode='speech' then mine.speech_seconds+180 else 180 end,mine.speech_seconds) returning id into did;
 update public.match_queue set status='matched',debate_id=did where uid in (u,candidate.uid);
 return did;
end $$;

revoke all on function public.attempt_match(text) from public,anon;
grant execute on function public.attempt_match(text) to authenticated;
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
 elsif p_collection='safety_preferences' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.learner_safety_preferences where owner_id=u order by owner_id limit 101 offset p_offset) t;
 elsif p_collection='read_receipts' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) into records from (select * from public.classroom_reads where user_id=u order by classroom_id limit 101 offset p_offset) t;
 else raise exception 'Unknown export collection'; end if;
 select coalesce(jsonb_agg(value order by ordinal),'[]'::jsonb) into result from jsonb_array_elements(records) with ordinality as entries(value,ordinal) where ordinal<=100;
 return jsonb_build_object('records',result,'has_more',jsonb_array_length(records)>100,'next_offset',p_offset+100);
end $$;
revoke all on function public.export_my_account_records(text,integer) from public,anon;
grant execute on function public.export_my_account_records(text,integer) to authenticated;

commit;
