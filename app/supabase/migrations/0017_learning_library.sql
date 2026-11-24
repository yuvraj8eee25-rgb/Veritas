-- Explicit opt-in library backups. No automatic document upload.
create table if not exists public.learning_libraries (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint learning_library_object check (jsonb_typeof(payload) = 'object'),
  constraint learning_library_size check (octet_length(payload::text) <= 5000000)
);
alter table public.learning_libraries enable row level security;
revoke all on public.learning_libraries from anon;
grant select, insert, update, delete on public.learning_libraries to authenticated;
create policy learning_library_owner on public.learning_libraries for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
