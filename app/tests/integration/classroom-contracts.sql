begin;
insert into auth.users(id,aud,role,email) values
 ('f0000000-0000-4000-8000-000000000011','authenticated','authenticated','veritas-coach-test@example.invalid'),
 ('f0000000-0000-4000-8000-000000000012','authenticated','authenticated','veritas-student-test@example.invalid');
insert into public.classrooms(id,owner_uid,name,invite_code) values ('f0000000-0000-4000-8000-000000000013','f0000000-0000-4000-8000-000000000011','Transactional test','ZTST2345');
insert into public.classroom_members(classroom_id,user_id,role) values
 ('f0000000-0000-4000-8000-000000000013','f0000000-0000-4000-8000-000000000011','coach'),
 ('f0000000-0000-4000-8000-000000000013','f0000000-0000-4000-8000-000000000012','student');
insert into public.classroom_assignments(id,classroom_id,created_by,kind,title,status,activity_settings)
values ('f0000000-0000-4000-8000-000000000014','f0000000-0000-4000-8000-000000000013','f0000000-0000-4000-8000-000000000011','drill','Drill contract test','published','{"drill_mode":"fallacy","difficulty":"all"}');
select set_config('veritas.test_answers',(select jsonb_agg(jsonb_build_object('id',id,'answer',answer,'timedOut',false))::text from (select * from public.drill_question_bank where mode='fallacy' order by id limit 8) q),true);
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000012',true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $test$
declare payload jsonb; first_result jsonb; second_result jsonb;
begin
 payload:=jsonb_build_object('assignment','f0000000-0000-4000-8000-000000000014','request_id','f0000000-0000-4000-8000-000000000015','content','Drill answers','activity',jsonb_build_object('modeKey','fallacy','difficulty','all','answers',current_setting('veritas.test_answers')::jsonb));
 first_result:=public.classroom_command('submit',payload);
 second_result:=public.classroom_command('submit',payload);
 if first_result->>'id' is distinct from second_result->>'id' then raise exception 'FAIL: retry created a different submission'; end if;
 if (first_result->'activity'->>'accuracy')::int<>100 then raise exception 'FAIL: canonical answers were not scored correctly'; end if;
end $test$;
do $test$
declare first_result jsonb; second_result jsonb;
begin
 first_result:=public.post_classroom_discussion('f0000000-0000-4000-8000-000000000014','f0000000-0000-4000-8000-000000000016','A structured review with a supported suggestion.');
 second_result:=public.post_classroom_discussion('f0000000-0000-4000-8000-000000000014','f0000000-0000-4000-8000-000000000016','A structured review with a supported suggestion.');
 if (first_result->>'duplicate')::boolean or not (second_result->>'duplicate')::boolean then raise exception 'FAIL: discussion retry was not idempotent'; end if;
end $test$;
reset role;
do $count$ begin
 if (select count(*) from public.classroom_questions where assignment_id='f0000000-0000-4000-8000-000000000014')<>1 then raise exception 'FAIL: duplicate discussion post'; end if;
end $count$;
update public.classroom_assignments set student_replies=false where id='f0000000-0000-4000-8000-000000000014';
set local role authenticated;
do $test$
begin
 begin
  perform public.post_classroom_discussion('f0000000-0000-4000-8000-000000000014','f0000000-0000-4000-8000-000000000017','A second post while replies are closed.');
  raise exception 'FAIL: student posted to a closed discussion';
 exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if;
 end;
end $test$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000011',true);
select public.post_classroom_discussion('f0000000-0000-4000-8000-000000000014','f0000000-0000-4000-8000-000000000018','Teacher guidance can still be posted to a closed discussion.');
reset role;
rollback;
select 'Classroom scoring, peer-post idempotency and teacher reply controls passed; all test data rolled back' as result;
