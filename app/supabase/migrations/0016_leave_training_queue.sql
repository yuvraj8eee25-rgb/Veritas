-- Allow authenticated players to leave an active matchmaking queue without
-- granting direct client DELETE access to match_queue.
create or replace function public.leave_training_queue() returns void
language plpgsql security definer set search_path=public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'Sign in first'; end if;
  delete from public.match_queue where uid = u and status = 'waiting';
end $$;

revoke all on function public.leave_training_queue() from public, anon;
grant execute on function public.leave_training_queue() to authenticated;
