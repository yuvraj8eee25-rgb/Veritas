-- Re-upserts are needed for safe attachment retries, but must still require
-- current cohort access. Profile progress is owner-read through its RPC; it
-- must not ride along with the signed-in leaderboard row grants.

drop policy if exists "Classroom attachment owners can update" on storage.objects;
create policy "Classroom attachment owners can update" on storage.objects
for update to authenticated
using (
  bucket_id = 'classroom-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.classroom_assignments a
    where a.id::text = (storage.foldername(name))[2]
      and (public.cw_coach(a.classroom_id)
        or (a.allow_files and public.cw_access(a.classroom_id)))
  )
)
with check (
  bucket_id = 'classroom-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.classroom_assignments a
    where a.id::text = (storage.foldername(name))[2]
      and (public.cw_coach(a.classroom_id)
        or (a.allow_files and public.cw_access(a.classroom_id)))
  )
);

-- Keep the leaderboard's existing fields available to signed-in users while
-- restricting progress JSON and operational columns to the owner-only RPC.
revoke select on table public.profiles from anon, authenticated;
grant select (uid, display_name, elo_rating, wins, losses, ties)
  on table public.profiles to authenticated;

notify pgrst, 'reload schema';
