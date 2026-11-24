begin;
insert into auth.users(id,aud,role,email) values
 ('f0000000-0000-4000-8000-000000000021','authenticated','authenticated','veritas-data-test@example.invalid'),
 ('f0000000-0000-4000-8000-000000000022','authenticated','authenticated','veritas-data-other@example.invalid');
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000021',true);
set local role authenticated;
do $test$
declare collection text; result jsonb; first_request jsonb; second_request jsonb;
begin
 foreach collection in array ARRAY['profile','debates','submissions','discussions','drafts','classroom_memberships','organization_memberships','library','blocks','reports','owned_classrooms','owned_organizations','recordings','private_rooms','read_receipts','created_assignments','account_requests','audit_events','safety_preferences'] loop
  result:=public.export_my_account_records(collection,0);
  if jsonb_typeof(result->'records')<>'array' then raise exception 'FAIL: invalid export shape %',collection; end if;
  if collection='profile' and exists(select 1 from jsonb_array_elements(result->'records') r where r->>'uid'<>'f0000000-0000-4000-8000-000000000021') then raise exception 'FAIL: foreign profile'; end if;
 end loop;
 begin perform public.export_my_account_records('unknown',0); raise exception 'FAIL: unknown collection'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 begin perform public.request_my_account_deletion('wrong'); raise exception 'FAIL: confirmation bypass'; exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 first_request:=public.request_my_account_deletion('REQUEST ACCOUNT DELETION'); second_request:=public.request_my_account_deletion('REQUEST ACCOUNT DELETION');
 if first_request<>second_request or first_request->>'status'<>'pending' then raise exception 'FAIL: request retry'; end if;
 perform public.cancel_my_account_deletion();
 if not exists(select 1 from public.account_deletion_requests where status='cancelled') then raise exception 'FAIL: cancellation'; end if;
 perform public.request_my_account_deletion('REQUEST ACCOUNT DELETION');
 begin update public.account_deletion_requests set status='completed'; raise exception 'FAIL: unauthorized raw update'; exception when insufficient_privilege then null; end;
 begin perform operator_note from public.account_deletion_requests; raise exception 'FAIL: private operator note'; exception when insufficient_privilege then null; end;
end $test$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000022',true);
do $test$ begin
 if exists(select 1 from public.account_deletion_requests) then raise exception 'FAIL: foreign request readable'; end if;
 perform public.cancel_my_account_deletion();
end $test$;
reset role;
do $test$ begin
 if (select status from public.account_deletion_requests where owner_id='f0000000-0000-4000-8000-000000000021')<>'pending' then raise exception 'FAIL: foreign request cancelled'; end if;
end $test$;
rollback;
select 'Account export scope, request retry, cancellation, private notes and cross-account protections passed; fixtures rolled back' as result;
