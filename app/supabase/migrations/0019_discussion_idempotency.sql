create table public.classroom_discussion_requests (
 owner_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 assignment_id uuid not null references public.classroom_assignments(id) on delete cascade,
 body_hash text not null,
 created_at timestamptz not null default now(),
 primary key(owner_id,request_id)
);
alter table public.classroom_discussion_requests enable row level security;
revoke all on public.classroom_discussion_requests from public,anon,authenticated;
grant all on public.classroom_discussion_requests to service_role;

create or replace function public.post_classroom_discussion(p_assignment uuid,p_request_id uuid,p_body text)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog as $$
declare u uuid:=auth.uid(); prior public.classroom_discussion_requests%rowtype;
begin
 if u is null then raise exception 'Sign in before posting'; end if;
 if p_request_id is null or p_assignment is null or p_body is null or length(trim(p_body)) not between 1 and 4000 then raise exception 'Invalid discussion post'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_request_id::text,23));
 select * into prior from public.classroom_discussion_requests where owner_id=u and request_id=p_request_id;
 if found then
  if prior.assignment_id<>p_assignment or prior.body_hash<>md5(trim(p_body)) then raise exception 'Use a new request ID for a different post'; end if;
  -- Membership is rechecked even for a retry after access was removed.
  if not exists(select 1 from public.classroom_assignments a where a.id=p_assignment and public.cw_access(a.classroom_id)) then raise exception 'Assignment unavailable'; end if;
  return jsonb_build_object('ok',true,'duplicate',true);
 end if;
 -- The existing command enforces published/archive state, membership and teacher reply controls.
 perform public.classroom_command('question',jsonb_build_object('assignment',p_assignment,'body',trim(p_body)));
 insert into public.classroom_discussion_requests(owner_id,request_id,assignment_id,body_hash) values(u,p_request_id,p_assignment,md5(trim(p_body)));
 return jsonb_build_object('ok',true,'duplicate',false);
end $$;
revoke all on function public.post_classroom_discussion(uuid,uuid,text) from public,anon;
grant execute on function public.post_classroom_discussion(uuid,uuid,text) to authenticated;
