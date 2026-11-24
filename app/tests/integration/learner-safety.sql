begin;
insert into auth.users(id,aud,role,email) values
 ('f0000000-0000-4000-8000-000000000031','authenticated','authenticated','veritas-safety-adult1@example.invalid'),
 ('f0000000-0000-4000-8000-000000000032','authenticated','authenticated','veritas-safety-adult2@example.invalid'),
 ('f0000000-0000-4000-8000-000000000033','authenticated','authenticated','veritas-safety-teen@example.invalid'),
 ('f0000000-0000-4000-8000-000000000034','authenticated','authenticated','veritas-safety-peer@example.invalid');
insert into public.classrooms(id,owner_uid,name,invite_code) values('f0000000-0000-4000-8000-000000000035','f0000000-0000-4000-8000-000000000031','Safety transaction test','ZSFT2345');
insert into public.classroom_members(classroom_id,user_id,role) values
 ('f0000000-0000-4000-8000-000000000035','f0000000-0000-4000-8000-000000000031','coach'),
 ('f0000000-0000-4000-8000-000000000035','f0000000-0000-4000-8000-000000000033','student'),
 ('f0000000-0000-4000-8000-000000000035','f0000000-0000-4000-8000-000000000034','student');
insert into public.classroom_assignments(id,classroom_id,created_by,kind,title,status,activity_settings) values('f0000000-0000-4000-8000-000000000036','f0000000-0000-4000-8000-000000000035','f0000000-0000-4000-8000-000000000031','private_debate','School debate','published','{}');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000033',true);
set local role authenticated;
do $test$ declare room jsonb; begin
 begin perform public.join_training_queue('Safety test motion'); raise exception 'FAIL: unknown age joined public queue'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 begin perform public.create_private_debate_room(null,'Safety test motion'); raise exception 'FAIL: unknown age created personal room'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 perform public.save_my_safety_preferences('teen',false);
 begin perform public.save_my_safety_preferences('teen',true); raise exception 'FAIL: teen public opt-in accepted'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 begin perform public.join_training_queue('Safety test motion'); raise exception 'FAIL: teen joined public queue'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 room:=public.create_private_debate_room('f0000000-0000-4000-8000-000000000036','Safety test motion');
 perform set_config('veritas.test_school_room',room->>'code',true);
 begin update public.learner_safety_preferences set public_match_opt_in=true; raise exception 'FAIL: raw write'; exception when insufficient_privilege then null; end;
end $test$;
reset role;
insert into public.match_queue(uid,topic) values('f0000000-0000-4000-8000-000000000033','Unique safety fixture motion');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000032',true);
do $test$ begin
 if exists(select 1 from public.learner_safety_preferences) then raise exception 'FAIL: foreign preferences visible'; end if;
 begin perform public.join_private_debate_room(current_setting('veritas.test_school_room'),'f0000000-0000-4000-8000-000000000036'); raise exception 'FAIL: nonmember joined school room'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 perform public.save_my_safety_preferences('adult',false);
 begin perform public.join_training_queue('Safety test motion'); raise exception 'FAIL: adult joined without opt-in'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 perform public.save_my_safety_preferences('adult',true);
 perform public.join_training_queue('Unique safety fixture motion');
end $test$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000031',true);
do $test$ declare did uuid; room jsonb; begin
 perform public.save_my_safety_preferences('adult',true);
 perform public.join_training_queue('Unique safety fixture motion');
 did:=public.attempt_match();
 if did is null then raise exception 'FAIL: opted-in adults did not match'; end if;
 if not exists(select 1 from public.debates where id=did and 'f0000000-0000-4000-8000-000000000032'::uuid=any(players) and not 'f0000000-0000-4000-8000-000000000033'::uuid=any(players)) then raise exception 'FAIL: stale teen queue was eligible'; end if;
 room:=public.create_private_debate_room(null,'Adult personal motion');
 perform set_config('veritas.test_adult_room',room->>'code',true);
 perform public.join_training_queue('Unique opt-out fixture motion');
 perform public.save_my_safety_preferences('adult',false);
 if exists(select 1 from public.match_queue where uid=auth.uid() and status='waiting') then raise exception 'FAIL: opt-out left waiting queue'; end if;
end $test$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000033',true);
do $test$ begin
 begin perform public.join_private_debate_room(current_setting('veritas.test_adult_room')); raise exception 'FAIL: teen joined personal room'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
end $test$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000034',true);
do $test$ declare room jsonb; begin
 perform public.save_my_safety_preferences('teen',false);
 room:=public.join_private_debate_room(current_setting('veritas.test_school_room'),'f0000000-0000-4000-8000-000000000036');
 if room->>'debate_id' is null then raise exception 'FAIL: authorized teen could not join assigned private room'; end if;
 if jsonb_array_length(public.export_my_account_records('safety_preferences')->'records')<>1 then raise exception 'FAIL: own preference export'; end if;
end $test$;
reset role;
rollback;
select 'Unknown/teen/adult eligibility, opt-in, queue withdrawal, school membership, private-room restrictions and owner privacy passed; fixtures rolled back' as result;
