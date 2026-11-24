# Database contract checks

Apply migrations through 0021 to an isolated Supabase project, then run each SQL file using an authorized database connection. Each test uses synthetic users with fixed IDs and BEGIN/ROLLBACK; it does not read real learner submissions or send email. A conflicting fixture ID is a failure, not a reason to delete an existing row. Prefer a dedicated test project and never run migration-reset commands against a shared project.

From `app/`, using an already linked test project:

```sh
npx supabase db query --remote --file tests/integration/account-data.sql --yes
npx supabase db query --remote --file tests/integration/classroom-contracts.sql --yes
npx supabase db query --remote --file tests/integration/learner-safety.sql --yes
```

Inspect the linked target before using `--remote`. Authentication fixtures require a database administrator, not an anonymous API key. The files fail on permission, scoring, duplicate-request or audience-control regressions. These checks are manual until CI has an isolated Supabase service; frontend unit tests do not substitute for database contracts.
