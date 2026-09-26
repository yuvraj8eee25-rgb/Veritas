# Classroom workspace

The classroom layer adds private coach-owned cohorts to Veritas. Apply
`0007_classrooms.sql`, `0008_classroom_programs.sql`, then the additive
`0009_classroom_production.sql`. The last migration keeps existing data while
moving browser writes behind the checked `classroom_command` RPC.

## Deployment

Run migrations in numeric order after the existing migrations. The production layer provides:

- `classrooms` — one private cohort owned by a coach.
- `classroom_members` — coach and student membership rows.
- `classroom_command(text,jsonb)` — the authenticated command surface for cohorts,
  invitations, assignments, drafts, submissions, grading, announcements, and membership.
- RLS policies that keep unpublished assignments, private submissions, and feedback scoped.
- Draft and published grading states, optimistic version checks, audit records, and rate limits.
- The `classroom-service` Edge Function boundary for provider-backed email.

After applying the SQL, refresh Supabase's API schema cache if the browser
still reports that `create_classroom` cannot be found:

```sql
notify pgrst, 'reload schema';
```

You can verify that the RPC exists with:

```sql
select p.proname, p.proargnames, pg_get_function_identity_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_classroom', 'join_classroom');
```

Client writes go through the RPC functions. The RLS policies allow members to
read only the classrooms and rosters they belong to. Students cannot create a
coach membership or change another user's role from the browser.

## Product flow

1. A coach opens `Classroom` and creates a cohort.
2. Veritas shows the generated invite code.
3. Students choose `Join with a code` and enter the code.
4. Both sides see the cohort and current roster.

Classroom requires an authenticated Supabase session. It does not switch to
local storage when Supabase is unavailable, so a failed backend request cannot
claim that a cohort, invite, submission, or grade was saved.

Set `EMAIL_PROVIDER_URL` and `EMAIL_PROVIDER_KEY` as Edge Function secrets to
enable invitation email. Without them, copying a generated invite link remains
available and the interface reports that email delivery is not configured.
Use a private Storage bucket for attachments and restrict upload size and MIME
types in the Storage policy and the service function.

For local development, serve `app/` over HTTP, configure the Supabase URL and
publishable key, apply the migrations, and sign in with separate coach,
student, and outsider accounts. Exercise code, link, and email invitations;
draft/publish visibility; attempt and deadline rejection; grading; removal;
archive/restore; and mobile keyboard navigation. Run `node --check` on the
Classroom and activity scripts before deployment.

Assignments, position papers, coach rubrics, and progress reports should build
on the classroom and membership IDs added here.
