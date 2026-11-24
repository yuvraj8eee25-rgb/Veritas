-- Private player safety records; review reports using the operator dashboard.
create table public.player_blocks (
 owner_id uuid not null references auth.users(id) on delete cascade,
 target_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(owner_id,target_id), check(owner_id<>target_id)
);
create index player_blocks_target on public.player_blocks(target_id,owner_id);
alter table public.player_blocks enable row level security;
grant select,insert,delete on public.player_blocks to authenticated;
grant all on public.player_blocks to service_role;
create policy player_blocks_read on public.player_blocks for select to authenticated using(owner_id=(select auth.uid()));
create policy player_blocks_delete on public.player_blocks for delete to authenticated using(owner_id=(select auth.uid()));
create policy player_blocks_insert on public.player_blocks for insert to authenticated with check(
 owner_id=(select auth.uid()) and exists(select 1 from public.debates d where owner_id=any(d.players) and target_id=any(d.players))
);
create table public.debate_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 debate_id uuid not null references public.debates(id) on delete cascade,
 reason text not null check(reason in ('harassment','unsafe-content','cheating','other')),
 detail text not null check(length(detail) between 10 and 2000),
 status text not null default 'open' check(status in ('open','reviewing','resolved')),
 created_at timestamptz not null default now(),
 unique(reporter_id,debate_id)
);
alter table public.debate_reports enable row level security;
grant select on public.debate_reports to authenticated;
grant insert(reporter_id,debate_id,reason,detail) on public.debate_reports to authenticated;
grant all on public.debate_reports to service_role;
create policy report_read_own on public.debate_reports for select to authenticated using(reporter_id=(select auth.uid()));
create policy report_insert_participant on public.debate_reports for insert to authenticated with check(
 reporter_id=(select auth.uid()) and exists(select 1 from public.debates d where d.id=debate_id and reporter_id=any(d.players))
);
create or replace function public.attempt_match(p_fallback_topic text default null) returns uuid language plpgsql security definer set search_path=public as $$
declare u uuid:=auth.uid(); mine public.match_queue%rowtype; candidate public.match_queue%rowtype; did uuid;
begin
 if u is null then raise exception 'Sign in first'; end if;
 -- Serialize match creation to avoid opposing clients locking each other's queue rows.
 perform pg_advisory_xact_lock(1414001);
 select * into mine from public.match_queue where uid=u for update;
 if not found then return null; end if;
 if mine.status='matched' then return mine.debate_id; end if;
 select * into candidate from public.match_queue q where not exists(select 1 from public.player_blocks b where (b.owner_id=u and b.target_id=q.uid) or (b.owner_id=q.uid and b.target_id=u)) and status='waiting' and uid<>u and practice_mode=mine.practice_mode and speech_seconds=mine.speech_seconds and max_turns_per_player=mine.max_turns_per_player and (mine.topic is null or topic is null or topic=mine.topic) order by created_at limit 1 for update;
 if not found then return null; end if;
 insert into public.debates(topic,players,player_order,max_turns_per_player,practice_mode,turn_seconds,speech_seconds)
 values(left(coalesce(candidate.topic,mine.topic,p_fallback_topic,'Open topic'),200),array[candidate.uid,u],array[candidate.uid,u],mine.max_turns_per_player,mine.practice_mode,case when mine.practice_mode='speech' then mine.speech_seconds+180 else 180 end,mine.speech_seconds) returning id into did;
 update public.match_queue set status='matched',debate_id=did where uid in (u,candidate.uid);
 return did;
end $$;

revoke all on function public.attempt_match(text) from public,anon;
grant execute on function public.attempt_match(text) to authenticated;
