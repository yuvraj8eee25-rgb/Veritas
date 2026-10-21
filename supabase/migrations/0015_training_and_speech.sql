-- Training improvements: activity settings, private rooms, recordings and server-scored drills.
-- Apply after 0014. Existing classrooms, submissions, XP and ratings are preserved.
begin;
alter table public.classroom_assignments add column if not exists activity_settings jsonb not null default '{}';
alter table public.debates add column if not exists practice_mode text not null default 'written' check(practice_mode in ('written','speech'));
alter table public.debates add column if not exists turn_seconds integer not null default 180 check(turn_seconds between 30 and 600);
alter table public.debates add column if not exists speech_seconds integer not null default 90 check(speech_seconds in (60,90,180));
alter table public.debates add column if not exists assignment_id uuid references public.classroom_assignments(id) on delete set null;
alter table public.debates add column if not exists is_private boolean not null default false;
alter table public.match_queue add column if not exists practice_mode text not null default 'written';
alter table public.match_queue add column if not exists speech_seconds integer not null default 90;
alter table public.match_queue add column if not exists max_turns_per_player integer not null default 3;

create or replace function public.training_settings(p_settings jsonb) returns jsonb language plpgsql immutable set search_path=public as $$
declare v jsonb:=coalesce(p_settings,'{}'); mode text; speech integer; turns integer; topic text; drill text; difficulty text;
begin
 mode:=coalesce(v->>'mode','written'); speech:=coalesce((v->>'speech_seconds')::int,90); turns:=coalesce((v->>'turns')::int,3);
 topic:=trim(coalesce(v->>'topic','')); drill:=coalesce(v->>'drill_mode','fallacy'); difficulty:=coalesce(v->>'difficulty','all');
 if jsonb_typeof(v)<>'object' or mode not in ('written','speech') or speech not in (60,90,180) or turns not in (3,5) or length(topic)>200 or drill not in ('fallacy','rebuttal','speed','steelman') or difficulty not in ('all','easy','medium','hard') then raise exception 'Invalid training settings'; end if;
 return jsonb_build_object('mode',mode,'speech_seconds',speech,'turn_seconds',case when mode='speech' then speech+180 else 180 end,'turns',turns,'topic',topic,'drill_mode',drill,'difficulty',difficulty);
end $$;
revoke all on function public.training_settings(jsonb) from public,anon,authenticated;

create table public.drill_question_bank(id text primary key,mode text not null,difficulty text not null,answer jsonb not null);
insert into public.drill_question_bank(id,mode,difficulty,answer) values
('f1','fallacy','easy','0'::jsonb),
('f2','fallacy','easy','1'::jsonb),
('f3','fallacy','easy','0'::jsonb),
('f4','fallacy','medium','0'::jsonb),
('f5','fallacy','medium','0'::jsonb),
('f6','fallacy','medium','0'::jsonb),
('f7','fallacy','hard','0'::jsonb),
('f8','fallacy','hard','0'::jsonb),
('f9','fallacy','hard','0'::jsonb),
('r1','rebuttal','easy','0'::jsonb),
('r2','rebuttal','easy','0'::jsonb),
('r3','rebuttal','medium','0'::jsonb),
('r4','rebuttal','medium','0'::jsonb),
('r5','rebuttal','hard','0'::jsonb),
('r6','rebuttal','hard','0'::jsonb),
('r7','rebuttal','hard','0'::jsonb),
('s1','speed','easy','false'::jsonb),
('s2','speed','easy','false'::jsonb),
('s3','speed','easy','true'::jsonb),
('s4','speed','medium','false'::jsonb),
('s5','speed','medium','true'::jsonb),
('s6','speed','medium','false'::jsonb),
('s7','speed','hard','false'::jsonb),
('s8','speed','hard','true'::jsonb),
('s9','speed','hard','false'::jsonb),
('st1','steelman','easy','0'::jsonb),
('st2','steelman','easy','0'::jsonb),
('st3','steelman','medium','0'::jsonb),
('st4','steelman','medium','0'::jsonb),
('st5','steelman','hard','0'::jsonb),
('st6','steelman','hard','0'::jsonb),
('st7','steelman','hard','0'::jsonb);
alter table public.drill_question_bank enable row level security;
revoke all on public.drill_question_bank from public,anon,authenticated;

create table public.private_debate_rooms (
 id uuid primary key default gen_random_uuid(), code text unique not null default upper(encode(gen_random_bytes(6),'hex')),
 host_uid uuid not null references auth.users(id) on delete cascade,
 guest_uid uuid references auth.users(id) on delete set null,
 assignment_id uuid references public.classroom_assignments(id) on delete cascade,
 topic text not null, settings jsonb not null,
 debate_id uuid references public.debates(id), expires_at timestamptz not null default now()+interval '2 hours',
 created_at timestamptz not null default now(), closed boolean not null default false
);
alter table public.private_debate_rooms enable row level security;
grant select on public.private_debate_rooms to authenticated;
create policy private_room_read on public.private_debate_rooms for select to authenticated using(auth.uid() in (host_uid,guest_uid));
alter publication supabase_realtime add table public.private_debate_rooms;

create or replace function public.create_private_debate_room(p_assignment_id uuid default null,p_topic text default '',p_settings jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare u uuid:=auth.uid(); a public.classroom_assignments%rowtype; settings jsonb; topic text; room public.private_debate_rooms%rowtype;
begin
 if u is null then raise exception 'Sign in first'; end if;
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
 if room.expires_at<now() or room.guest_uid is not null then raise exception 'Room expired or full'; end if;
 insert into public.debates(topic,players,player_order,max_turns_per_player,practice_mode,turn_seconds,speech_seconds,assignment_id,is_private)
 values(room.topic,array[room.host_uid,u],array[room.host_uid,u],(room.settings->>'turns')::int,room.settings->>'mode',(room.settings->>'turn_seconds')::int,(room.settings->>'speech_seconds')::int,room.assignment_id,true) returning id into did;
 update public.private_debate_rooms set guest_uid=u,debate_id=did where id=room.id returning * into room;
 return to_jsonb(room);
end $$;
create or replace function public.close_private_debate_room(p_room_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin update public.private_debate_rooms set closed=true where id=p_room_id and host_uid=auth.uid() and debate_id is null; end $$;
revoke all on function public.create_private_debate_room(uuid,text,jsonb),public.join_private_debate_room(text,uuid),public.close_private_debate_room(uuid) from public,anon;
grant execute on function public.create_private_debate_room(uuid,text,jsonb),public.join_private_debate_room(text,uuid),public.close_private_debate_room(uuid) to authenticated;

create or replace function public.join_training_queue(p_topic text default null,p_settings jsonb default '{}') returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); s jsonb;
begin
 if u is null then raise exception 'Sign in first'; end if; s:=public.training_settings(p_settings);
 if length(coalesce(p_topic,''))>200 then raise exception 'Motion too long'; end if;
 insert into public.match_queue(uid,topic,practice_mode,speech_seconds,max_turns_per_player) values(u,nullif(trim(p_topic),''),s->>'mode',(s->>'speech_seconds')::int,(s->>'turns')::int)
 on conflict(uid) do update set topic=excluded.topic,practice_mode=excluded.practice_mode,speech_seconds=excluded.speech_seconds,max_turns_per_player=excluded.max_turns_per_player,status='waiting',debate_id=null,created_at=now();
end $$;
revoke all on function public.join_training_queue(text,jsonb) from public,anon;
grant execute on function public.join_training_queue(text,jsonb) to authenticated;

create or replace function public.attempt_match(p_fallback_topic text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); mine public.match_queue%rowtype; candidate public.match_queue%rowtype; did uuid;
begin
 if u is null then raise exception 'Sign in first'; end if;
 -- Serialize match creation to avoid opposing clients locking each other's queue rows.
 perform pg_advisory_xact_lock(1414001);
 select * into mine from public.match_queue where uid=u for update;
 if not found then return null; end if;
 if mine.status='matched' then return mine.debate_id; end if;
 select * into candidate from public.match_queue where status='waiting' and uid<>u and practice_mode=mine.practice_mode and speech_seconds=mine.speech_seconds and max_turns_per_player=mine.max_turns_per_player and (mine.topic is null or topic is null or topic=mine.topic) order by created_at limit 1 for update;
 if not found then return null; end if;
 insert into public.debates(topic,players,player_order,max_turns_per_player,practice_mode,turn_seconds,speech_seconds)
 values(left(coalesce(candidate.topic,mine.topic,p_fallback_topic,'Open topic'),200),array[candidate.uid,u],array[candidate.uid,u],mine.max_turns_per_player,mine.practice_mode,case when mine.practice_mode='speech' then mine.speech_seconds+180 else 180 end,mine.speech_seconds) returning id into did;
 update public.match_queue set status='matched',debate_id=did where uid in (u,candidate.uid);
 return did;
end $$;
-- Browser inserts no longer bypass training settings validation.
drop policy if exists match_queue_insert_own on public.match_queue;
revoke insert,update on public.match_queue from anon,authenticated;

-- Preserve the former command behind a checked wrapper. Submissions use the checked command.
revoke all on function public.submit_classroom_assignment(uuid,text) from public,anon,authenticated;
alter function public.classroom_command(text,jsonb) rename to classroom_command_before_training;
revoke all on function public.classroom_command_before_training(text,jsonb) from public,anon,authenticated;
create or replace function public.classroom_command(p_action text,p_data jsonb default '{}') returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare a public.classroom_assignments%rowtype; r jsonb; settings jsonb; activity jsonb; v_answer jsonb; q public.drill_question_bank%rowtype; answers jsonb:='[]'; seen text[]:='{}'; correct integer:=0; total integer:=0; path text; record jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in first'; end if;
 if octet_length(p_data::text)>400000 then raise exception 'Request too large'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,19));
 if p_action='assignment' and coalesce(p_data->>'operation','') not in ('archive','delete') then
  settings:=public.training_settings(p_data->'activity_settings');
  if p_data->>'kind' in ('ai_debate','private_debate','live_debate') and settings->>'topic'='' then raise exception 'Set the debate motion'; end if;
 end if;
 if p_action='submit' then
  select * into a from public.classroom_assignments where id=(p_data->>'assignment')::uuid;
  if not found or not public.cw_access(a.classroom_id) then raise exception 'Assignment unavailable'; end if;
  -- Honor completed retries even if the assignment settings changed afterwards.
  select to_jsonb(s) into r from public.classroom_submissions s where s.student_uid=auth.uid() and s.request_id=(p_data->>'request_id')::uuid and s.assignment_id=a.id;
  if r is not null then return r; end if;
  settings:=public.training_settings(a.activity_settings); activity:=p_data->'activity';
  if a.kind='private_debate' then
   if not exists(select 1 from public.debates d where d.id=(activity->>'id')::uuid and d.assignment_id=a.id and d.is_private and d.status='completed' and auth.uid()=any(d.players)) then raise exception 'Complete this assignment in its private room'; end if;
  elsif a.kind='live_debate' then
   if not exists(select 1 from public.debates d where d.id=(activity->>'id')::uuid and not d.is_private and d.status='completed' and auth.uid()=any(d.players) and d.topic=coalesce(nullif(settings->>'topic',''),a.title) and d.practice_mode=settings->>'mode' and d.max_turns_per_player=(settings->>'turns')::int) then raise exception 'Complete a live debate with the assigned motion and practice settings'; end if;
  elsif a.kind='drill' then
   if activity->>'modeKey' is distinct from settings->>'drill_mode' or activity->>'difficulty' is distinct from settings->>'difficulty' or jsonb_typeof(activity->'answers') is distinct from 'array' or jsonb_array_length(activity->'answers') not between 1 and 8 then raise exception 'Complete the assigned drill'; end if;
   for v_answer in select value from jsonb_array_elements(activity->'answers') loop
    select * into q from public.drill_question_bank where id=v_answer->>'id' and mode=settings->>'drill_mode' and (settings->>'difficulty'='all' or difficulty=settings->>'difficulty');
    if not found or q.id=any(seen) then raise exception 'Invalid or duplicate drill question'; end if;
    seen:=array_append(seen,q.id); total:=total+1;
    if (v_answer->'answer')=q.answer and coalesce(v_answer->>'timedOut','false')='false' then correct:=correct+1; end if;
    answers:=answers||jsonb_build_object('id',q.id,'difficulty',q.difficulty,'answer',v_answer->'answer','correct',(v_answer->'answer')=q.answer and coalesce(v_answer->>'timedOut','false')='false');
   end loop;
   if total<>(select least(8,count(*)) from public.drill_question_bank where mode=settings->>'drill_mode' and (settings->>'difficulty'='all' or difficulty=settings->>'difficulty')) then raise exception 'Finish every question in the assigned drill'; end if;
   activity:=jsonb_build_object('modeKey',settings->>'drill_mode','difficulty',settings->>'difficulty','answers',answers,'correct',correct,'total',total,'accuracy',round(100.0*correct/total),'resultType','server-scored');
   p_data:=jsonb_set(p_data,'{activity}',activity);
   p_data:=jsonb_set(p_data,'{content}',to_jsonb(format('Assigned drill: %s. %s/%s correct (%s%%).',settings->>'drill_mode',correct,total,round(100.0*correct/total))));
  elsif a.kind='ai_debate' then
   if activity->>'topic' is distinct from coalesce(nullif(settings->>'topic',''),a.title) or activity->>'mode' is distinct from settings->>'mode' then raise exception 'Complete the assigned motion and practice mode'; end if;
  end if;
  if a.kind='ai_debate' then
   for record in select value from jsonb_array_elements(coalesce(activity->'transcript','[]')) loop
    path:=record->>'audioPath';
    if path is not null and not exists(select 1 from public.debate_recordings dr where dr.path=path and dr.owner_uid=auth.uid() and dr.assignment_id=a.id) then raise exception 'Recording does not belong to this assignment'; end if;
   end loop;
  end if;
 end if;
 r:=public.classroom_command_before_training(p_action,p_data);
 if p_action='assignment' and settings is not null then update public.classroom_assignments set activity_settings=settings where id=(r->>'id')::uuid; end if;
 return r;
end $$;
revoke all on function public.classroom_command(text,jsonb) from public,anon;
grant execute on function public.classroom_command(text,jsonb) to authenticated;

create table public.debate_recordings(path text primary key,owner_uid uuid not null references auth.users(id) on delete cascade,debate_id uuid references public.debates(id) on delete cascade,assignment_id uuid references public.classroom_assignments(id) on delete set null,created_at timestamptz not null default now());
alter table public.debate_recordings enable row level security;
revoke all on public.debate_recordings from public,anon,authenticated;
create or replace function public.can_read_debate_recording(p_path text) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.debate_recordings r where r.path=p_path and (r.owner_uid=auth.uid() or exists(select 1 from public.debates d where d.id=r.debate_id and auth.uid()=any(d.players)) or exists(select 1 from public.classroom_assignments a join public.classroom_submissions s on s.assignment_id=a.id where a.id=r.assignment_id and public.cw_coach(a.classroom_id) and (s.student_uid=r.owner_uid or (r.debate_id is not null and s.activity->>'id'=r.debate_id::text)) and exists(select 1 from jsonb_array_elements(coalesce(s.activity->'transcript',s.activity->'turns','[]'::jsonb)) t where t->>'audioPath'=r.path))));
$$;
revoke all on function public.can_read_debate_recording(text) from public,anon;
grant execute on function public.can_read_debate_recording(text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('debate-recordings','debate-recordings',false,10485760,array['audio/webm','audio/ogg','audio/mp4']) on conflict(id) do nothing;
create policy recording_upload on storage.objects for insert to authenticated with check(bucket_id='debate-recordings' and (storage.foldername(name))[1]=auth.uid()::text);
create policy recording_read on storage.objects for select to authenticated using(bucket_id='debate-recordings' and ((storage.foldername(name))[1]=auth.uid()::text or public.can_read_debate_recording(name)));
create or replace function public.can_delete_unregistered_recording(p_path text) returns boolean language sql stable security definer set search_path=public as $$ select split_part(p_path,'/',1)=auth.uid()::text and not exists(select 1 from public.debate_recordings where path=p_path); $$;
revoke all on function public.can_delete_unregistered_recording(text) from public,anon;
grant execute on function public.can_delete_unregistered_recording(text) to authenticated;
create policy recording_delete on storage.objects for delete to authenticated using(bucket_id='debate-recordings' and (storage.foldername(name))[1]=auth.uid()::text and public.can_delete_unregistered_recording(name));
create or replace function public.register_debate_recording(p_path text,p_debate_id uuid default null,p_assignment_id uuid default null) returns void language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); a public.classroom_assignments%rowtype;
begin
 if u is null or split_part(p_path,'/',1)<>u::text then raise exception 'Recording ownership denied'; end if;
 if p_debate_id is not null and not exists(select 1 from public.debates where id=p_debate_id and u=any(players)) then raise exception 'Debate access denied'; end if;
 if p_assignment_id is not null then
  select * into a from public.classroom_assignments where id=p_assignment_id;
  if not found or not public.cw_access(a.classroom_id) or a.status<>'published' or a.archived then raise exception 'Assignment access denied'; end if;
 end if;
 if not exists(select 1 from storage.objects where bucket_id='debate-recordings' and name=p_path and (metadata->>'size')::bigint between 1 and 10485760 and metadata->>'mimetype' in ('audio/webm','audio/ogg','audio/mp4')) then raise exception 'Upload a supported recording first'; end if;
 insert into public.debate_recordings(path,owner_uid,debate_id,assignment_id) values(p_path,u,p_debate_id,p_assignment_id) on conflict(path) do nothing;
end $$;
revoke all on function public.register_debate_recording(text,uuid,uuid) from public,anon;
grant execute on function public.register_debate_recording(text,uuid,uuid) to authenticated;
create or replace function public.submit_training_turn(p_debate_id uuid, p_text text, p_audio_path text default null, p_expected_turn integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid      uuid := auth.uid();
  d           record;
  whose_turn  uuid;
  new_turns   jsonb;
  total_turns int;
  new_status  text;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_text is null or length(trim(p_text)) = 0 then
    raise exception 'empty turn';
  end if;

  select * into d from debates where id = p_debate_id for update;
  if d is null then
    raise exception 'debate not found';
  end if;
  if not (my_uid = any(d.players)) then
    raise exception 'not a player in this debate';
  end if;
  if d.status <> 'active' then
    raise exception 'debate not active';
  end if;

  if p_expected_turn is not null and p_expected_turn<>d.turn_index then raise exception 'This turn already advanced. Refresh before sending.'; end if;
  if length(p_text) > (case when d.practice_mode='speech' then 8000 else 4000 end) then raise exception 'Argument too long'; end if;
  if now()>coalesce(d.last_turn_at,d.created_at)+make_interval(secs=>d.turn_seconds) then raise exception 'Turn expired'; end if;
  if d.practice_mode='speech' and (p_audio_path is null or not exists(select 1 from public.debate_recordings r where r.path=p_audio_path and r.owner_uid=my_uid and r.debate_id=d.id)) then raise exception 'Record and save your speech before sending'; end if;
  whose_turn := d.player_order[(d.turn_index % 2) + 1]; -- pg arrays are 1-indexed
  if whose_turn <> my_uid then
    raise exception 'not your turn';
  end if;

  new_turns := d.turns || jsonb_build_object(
    'uid', my_uid, 'text', trim(p_text), 'audioPath', p_audio_path, 'ts', (extract(epoch from now()) * 1000)::bigint
  );
  total_turns := d.max_turns_per_player * 2;
  new_status  := case when jsonb_array_length(new_turns) >= total_turns then 'completed' else 'active' end;

  update debates
  set turns = new_turns,
      turn_index = d.turn_index + 1,
      status = new_status,
      last_turn_at = now()
  where id = p_debate_id;

  if new_status = 'completed' then
    perform notify_ai_referee(p_debate_id);
  end if;
end;
$$;

revoke all on function public.submit_training_turn(uuid,text,text,integer) from public,anon;
grant execute on function public.submit_training_turn(uuid,text,text,integer) to authenticated;

create or replace function public.submit_turn(p_debate_id uuid,p_text text) returns void language plpgsql security definer set search_path=public as $$ begin perform public.submit_training_turn(p_debate_id,p_text,null); end $$;
-- Only trusted backend code applies ratings or expires abandoned debates.
revoke all on function public.apply_elo_update(uuid),public.expire_stale_debates(integer) from public,anon,authenticated;
grant execute on function public.apply_elo_update(uuid),public.expire_stale_debates(integer) to service_role;
-- Friendly/private practice does not change global competitive Elo.
create or replace function public.trigger_apply_elo_update() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.ai_verdict is not null and old.ai_verdict is null and not new.is_private then
  begin perform public.apply_elo_update(new.id); exception when others then raise warning 'apply_elo_update failed for debate %: %',new.id,sqlerrm; end;
 end if;
 return new;
end $$;
create or replace function public.submit_timeout_turn(p_debate_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  my_uid      uuid := auth.uid();
  d           record;
  whose_turn  uuid;
  new_turns   jsonb;
  total_turns int;
  n           int;
  all_passes  boolean := false;
  new_status  text;
begin
  if my_uid is null then
    raise exception 'not authenticated';
  end if;

  select * into d from debates where id = p_debate_id for update;
  if d is null or d.status <> 'active' then
    return; -- mirrors original best-effort, non-fatal behavior
  end if;

  if not my_uid=any(d.players) then raise exception 'Not a participant'; end if;
  if now()<coalesce(d.last_turn_at,d.created_at)+make_interval(secs=>d.turn_seconds) then return; end if;
  whose_turn := d.player_order[(d.turn_index % 2) + 1];


  new_turns := d.turns || jsonb_build_object(
    'uid', whose_turn, 'text', '⏳ Time''s up — passing the turn.', 'ts', (extract(epoch from now()) * 1000)::bigint
  );
  total_turns := d.max_turns_per_player * 2;
  n := jsonb_array_length(new_turns);

  if n >= 2 then
    select bool_and((elem ->> 'text') like '⏳%')
    into all_passes
    from jsonb_array_elements(new_turns) with ordinality as t(elem, idx)
    where idx > n - 2;
  end if;

  new_status := case when coalesce(all_passes, false) or n >= total_turns then 'completed' else 'active' end;

  update debates
  set turns = new_turns,
      turn_index = d.turn_index + 1,
      status = new_status,
      last_turn_at = now()
  where id = p_debate_id;

  if new_status = 'completed' then
    perform notify_ai_referee(p_debate_id);
  end if;
end;
$$;


alter table public.debates add column if not exists conceded_uid uuid references auth.users(id);
create or replace function public.resign_training_debate(p_debate_id uuid) returns void language plpgsql security definer set search_path=public as $$
declare d public.debates%rowtype; u uuid:=auth.uid();
begin
 select * into d from public.debates where id=p_debate_id for update;
 if u is null or not u=any(d.players) then raise exception 'Debate access denied'; end if;
 if d.status<>'active' then return; end if;
 update public.debates set status='completed',conceded_uid=u,last_turn_at=now() where id=d.id;
 perform public.notify_ai_referee(d.id);
end $$;
revoke all on function public.resign_training_debate(uuid) from public,anon;
grant execute on function public.resign_training_debate(uuid) to authenticated;

commit;
notify pgrst, 'reload schema';
