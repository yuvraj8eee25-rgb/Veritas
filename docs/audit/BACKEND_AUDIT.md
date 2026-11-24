# Veritas backend, data, security, and operations audit

**Snapshot:** 20 November 2026, local `main` working tree, including uncommitted changes. Scope: Supabase SQL migrations and Edge Functions in `app/supabase/`, the Next.js function proxy and health handler, browser-to-backend contracts, deployment/test configuration, and data lifecycle. This is a **static/local audit**, not a penetration test or verification of the linked hosted Supabase project. Related reports: [BUSINESS_AUDIT.md](BUSINESS_AUDIT.md), [FRONTEND_AUDIT.md](FRONTEND_AUDIT.md).

## System map

```text
Next client app ── Supabase JS ── Auth / PostgREST RPC / Realtime / Storage
       │
       └─ POST /api/supabase-functions ── allowlisted Supabase Edge Functions
                                             ├─ ai-debate → Gemini
                                             ├─ assess-evidence → Gemini
                                             ├─ exa-search → Exa / Tavily / OpenAlex
                                             └─ classroom-service → email provider

Scheduled Edge Functions → service-role RPCs → cleanup / topics / referee
```

The production web app is in `veritas-react/`, but the SQL and Edge Functions live under the older `app/` tree. Sixteen ordered migrations (`0001`–`0016`) build matchmaking, profiles/ELO, classrooms, private storage, quota accounting, idempotency, speech, and queue cancellation. The browser calls some Supabase tables/RPCs directly, with row-level security and `SECURITY DEFINER` RPCs providing the security boundary. The Next proxy is a transport boundary, not the sole authorization layer.

| Priority | Meaning |
| --- | --- |
| P0 | Potential cross-user data corruption or essential production control to validate before broad use. |
| P1 | Material reliability, privacy, abuse, or maintainability risk. |
| P2 | Operational hardening and clarity. |

## Detailed findings

### BE-01 · P0 · Profile progress is client-authoritative and cross-account state can overwrite it

**Evidence.** `app/src/features/practice-state.js:3,34-49` uses a single local key. `veritas-react/src/App.tsx:165,433-468` loads local progress, fetches `get_my_profile_progress` but only uses its `avatarFileId`, then writes the local XP/assessments via `sync_profile`. `app/supabase/migrations/0006_reconcile_profiles.sql:122-146` validates display name and caller identity but accepts `p_progress` JSON without a schema/score invariant. Later migrations restrict *read access* to progress (`0011_reliability_and_classroom_files.sql:42-53`, `0012_attachment_and_profile_least_privilege.sql:31-34`), which is good, but do not make scoring authoritative.

**Risk.** A shared browser can mix A/B practice records and a new device can replace existing server progress with defaults. A user can also call the RPC with arbitrary XP. This does **not** imply the server ELO rating is writable by clients; `sync_profile` excludes ELO fields. It does mean XP and mastery cannot be treated as verified server records.

**Remediation.** Owner-scope local keys; fetch and reconcile the full server progress before any write; version the progress schema; use optimistic concurrency or append-only attempt events for conflict resolution. If XP influences rankings or rewards, validate/scored attempts on the server. Test guest transfer, A→B switch, two devices, offline merge, and simultaneous writes with disposable accounts.

### BE-02 · P1 · A pending Classroom submission is stored without an owner guard

**Evidence.** `veritas-react/src/App.tsx:100-107,185-187` reads a single `sessionStorage` key for pending result, containing an assignment, request ID, content, and activity. The auth effect at `App.tsx:486-490` retries it whenever `sessionEmail` becomes available. The backend Classroom command checks membership and attempt constraints (`app/supabase/migrations/0009_classroom_production.sql`, `0015_training_and_speech.sql:169-218`), so an unauthorized submission should be rejected; still, the client may show/attempt data from the previous user on a shared tab.

**Remediation.** Include account UID and assignment ID in the storage key and payload; verify both before displaying or retrying; clear on sign-out/account switch; preserve the existing idempotency request ID only for the same owner. Add a two-account, same-tab test.

### BE-03 · P1 · Scheduled maintenance is documented but not provisioned by migrations

**Evidence.** `app/supabase/migrations/0001_init.sql:308-338` and `0003_stale_debate_cleanup.sql:202-216` contain commented `cron.schedule` examples. The Edge Functions exist and require a shared secret (`cleanup-stale-queue/index.ts`, `cleanup-stale-debates/index.ts`, `generate-hot-topics/index.ts`), but no executable schedule definition appears in `app/supabase/`.

**Risk.** A fresh project migrated from source alone will not run stale-queue/debate cleanup or topic refresh. This can leave users waiting, rooms stalled, and topics stale. The README may describe a linked project where jobs were manually configured; that deployment was not inspected.

**Remediation.** Manage schedules as reviewed infrastructure or an explicit setup script with a secret-store reference; verify jobs and last-run timestamps in a test project. Add a deployment smoke check that joins/abandons a queue and confirms automatic expiry.

### BE-04 · P1 · The Next proxy lacks an explicit request-size boundary

**Evidence.** `veritas-react/src/app/api/supabase-functions/route.ts:17-28` calls `request.json()` before checking the requested function and without a Content-Length/body limit. It then JSON-serializes arbitrary `input.body` and relays the full upstream response (`route.ts:46-69`). It checks Bearer syntax only (`route.ts:18-21`); the Edge layer independently verifies the user and quotas (`app/supabase/functions/_shared/http.ts:59-78`).

**Risk.** Even an unauthenticated caller can send an oversized JSON body with a syntactically valid Bearer header and consume server memory/CPU before Edge authorization. The proxy allowlist and downstream guards reduce function misuse but not request parsing work.

**Remediation.** Enforce a conservative byte limit before parse (including streamed requests without Content-Length), validate a per-function body schema/action, and cap/stream upstream responses. Keep Edge validation in place. Add tests for malformed JSON, oversized body, unsupported function/action, timeout, and upstream non-JSON responses.

### BE-05 · P1 · Browser helper does not apply its timeout when no caller signal is passed

**Evidence.** `veritas-react/src/lib/supabase-functions.ts:28-43` computes a browser timeout but sets `signal` only if an external signal exists (`signal: signal ? AbortSignal.any([...]) : undefined`). The Next proxy has its own timeout (`route.ts:43-59`), so a healthy proxy should eventually answer, but client waits can be unbounded if the local connection stalls before a response.

**Remediation.** Always pass `AbortSignal.timeout(timeout)`, combined with caller signal when supplied. Test network-hang and user-cancel behavior; preserve meaningful request IDs in error messages.

### BE-06 · P1 · Health endpoint reports configuration, not dependency health

**Evidence.** `veritas-react/src/app/api/health/route.ts:1-12` returns `ok: true` whenever the handler runs and reports only presence of the public Supabase URL/key. It does not probe Auth, DB, Edge Functions, Storage, scheduled jobs, or provider credentials.

**Risk.** A deployment monitor can mark the site healthy while the core signed-in product is unavailable. The name “health” and README deployment-health description may overstate its guarantee.

**Remediation.** Call this endpoint “liveness/config” in docs, or add a separate readiness check with bounded, safe dependency probes and appropriate access/rate control. Monitor actual feature success rates independently.

### BE-07 · P1 · Recording and attachment lifecycle lacks an explicit retention/deletion path

**Evidence.** Private buckets and access rules exist (`0011_reliability_and_classroom_files.sql:63-135`, `0015_training_and_speech.sql:220-250`). The recording delete policy allows an owner to delete only **unregistered** recordings (`0015_training_and_speech.sql:233-237`). I found no scheduled retention/cleanup policy or user-facing deletion/export flow in the repository for registered audio, classroom attachments, submissions, and discussion content. Some table foreign keys cascade on account deletion; Storage object lifecycle and all related records still need verification.

**Risk.** Stored speech and classroom material may outlive the period users expect. Orphan files can accrue when upload succeeds but registration/submission fails. This is a lifecycle gap, not proof of unauthorized access.

**Remediation.** Define retention by data class; add a reviewed deletion/export path and orphan cleanup; test signed URL expiry, member removal, account deletion, and coach access after an assignment is archived. Document who can retrieve audio and for how long.

### BE-08 · P1 · Current-app observability is limited

**Evidence.** The original Vite app imports optional Sentry/Web Vitals (`app/src/main.js:4`, `app/src/monitoring.js:1-53`); the Next app does not import this module or have a visible `instrumentation`, `error.tsx`, or analytics layer. Edge Functions use structured event logs for failures (`exa-search/index.ts:89,149,172`, `ai-debate/index.ts:314`), and the proxy propagates request IDs (`route.ts:9-14,50-68`), which is a useful base.

**Risk.** Browser failures, failed hydration, inaccessible flows, p95 latency, and cross-service failures are difficult to diagnose in the current app. The health endpoint will not catch them.

**Remediation.** Add privacy-reviewed client/server error reporting, request-ID correlation, provider latency/status metrics, and feature completion metrics. Strip argument text, transcripts, credentials, query strings, and personal identifiers. Create alerts for elevated 5xx, quota denials, failed Classroom submissions, and stuck live rooms.

### BE-09 · P1 · Live provider contracts are not covered by deployment tests

**Evidence.** React Node tests cover many parsing, provenance, abstention, and version-contract cases (`veritas-react/tests/*.mjs`; 37 passed locally). `veritas-react/README.md` nevertheless explicitly lists invitation email, authenticated Classroom, live multiplayer, speech, and provider-backed AI/evidence as needing real end-to-end verification. The local Edge syntax check passed; SQL migrations were not applied in this audit.

**Risk.** Local contract tests cannot prove secrets are configured, migrations match code, provider schemas remain compatible, two-user Realtime works, or email actually arrives.

**Remediation.** Maintain a disposable Supabase test project with migrations, functions, and test-only secrets. Run a seeded smoke matrix: auth, profile isolation, student/coach invite and grade, private attachment access, public and private live debate, speech upload/transcription, AI debate, Evidence Lab source citation/abstention, cron cleanup. Use provider stubs in PR CI and controlled real-provider runs before release.

### BE-10 · P1 · Release and migration state is not reproducible from this checkout alone

**Evidence.** Current React package has no test/typecheck script (`veritas-react/package.json:5-9`). No `.github/` workflow is present, though `app/README.md:137-155` says GitHub Actions runs smoke tests. `veritas-react/README.md` asserts migrations `0014`–`0016` and functions are deployed to a linked project; this local audit had no hosted-state access. `app/README.md:169` still says apply migrations through `0015`, while `0016` exists. There are both npm and pnpm lockfiles in `veritas-react/`.

**Risk.** Fresh deployments can differ from the linked project, and maintainers may run the wrong package manager, omit migration 0016, or ship without current-app tests. Documentation drift can obscure whether a live bug is code, schema, or deployment state.

**Remediation.** Choose one package manager/lockfile per app; add a repo CI workflow; record migration version and function deployment hashes; make deploy scripts idempotent; validate `0016` and schedules in an empty test project. Update setup docs to reflect the chosen path.

### BE-11 · P2 · Rate limits are per action, not a full cost/abuse budget

**Evidence.** `consume_veritas_quota` is service-role-only, serializes by user/action, and keeps a two-day request log (`0011_reliability_and_classroom_files.sql:15-38`). Edge guards authenticate with `getUser` before quota consumption (`_shared/http.ts:59-78`). `ai-debate` uses 20/600s (`ai-debate/index.ts:280`), `assess-evidence` 30/600s, search a configurable limit, classroom email 20/3600s.

**Assessment.** This is a meaningful protection and should be kept. It does not bound total spend across accounts, cumulative bytes/tokens, or retries within one user journey. It also consumes quota before body validation, so malformed requests can use a user's quota.

**Remediation.** Add cost and concurrency budgets by feature/project, record provider usage, and validate cheap input shape before expensive work where possible. Watch false quota denials during legitimate multi-call investigations.

### BE-12 · P2 · Some database constraints and raw JSON contracts need versioned validation

**Evidence.** The code has several good validators: `training_settings` checks mode, timing, turns, topic and drill (`0015_training_and_speech.sql:14-25`); source/search inputs have limits (`assess-evidence/index.ts:60-65`, `exa-search/index.ts:33-35`); Classroom rubric validation is added in migration `0014`. Other state remains broad JSON, notably `profiles.progress` and activity settings, and the client uses `any` in several API types (`veritas-react/src/App.tsx:60-77,1179`).

**Risk.** Older clients can write shapes the current UI does not expect; migrations and Edge deploys can drift independently.

**Remediation.** Introduce versioned schemas for progress, AI verdicts, activity payloads, and provider responses. Add backward-compatible migration logic and reject malformed data at trust boundaries. Generate types from the final Supabase schema after migration validation.

## Security controls that are already present

- RLS is enabled on queue, debates, profiles, Classroom, quota log, recording records, and private rooms in the migrations; important writes go through authenticated RPCs rather than direct table update (`0001_init.sql`, `0004_elo_system.sql`, `0011_reliability_and_classroom_files.sql`, `0015_training_and_speech.sql`).
- Later migrations narrow profile reads to leaderboard columns and an owner-only progress RPC (`0011` and `0012`). Queue reads are limited to the user's own row (`0011:58-61`).
- Private avatar, attachment, and audio buckets use private storage and scoped policies; signed URLs are generated after authorization checks in the app.
- The Next proxy allowlists four functions and forwards the user's bearer rather than a service-role key (`route.ts:3,17-21,43-57`). Edge functions independently validate the user and apply service-role quota checks (`_shared/http.ts:59-78`).
- Cron/referee functions require a shared secret (`_shared/http.ts:44-56`); invitation tokens are hashed in later migrations (`0009_classroom_production.sql:169`, `0013_idempotent_classroom_invites.sql:171-173`).
- Classroom invitation and grading idempotency logic exists (`0013_idempotent_classroom_invites.sql`); rubric validation is added in `0014`.
- Only public `.env.example` files are tracked; `.env.local` is ignored by the repository. No secret values were printed or included in this audit.

These are source-level controls. Their effective production posture depends on the applied migration order, grants, Storage settings, Edge deployment, and actual secrets. `SECURITY DEFINER` functions deserve integration tests with student, coach, anonymous, and service roles, especially after each migration.

## Backend boundary inventory and required negative tests

| Boundary | Source | Positive contract | Negative case to prove in a test project |
| --- | --- | --- | --- |
| Auth/session | `veritas-react/src/lib/supabase.ts`; Edge `_shared/http.ts` | Signed-in browser can access own authorized resources | Expired/forged JWT and anonymous request cannot invoke provider work. |
| Profile progress | migrations `0006`, `0011`, `0012` | Owner reads progress through RPC; public ELO columns available to signed-in users | B cannot read A's progress; arbitrary XP currently **can** be sent by owner, so decide whether that is acceptable. |
| Match queue and live room | migrations `0001`, `0003`, `0015`, `0016` | Caller queues, matches, submits a valid timed turn, leaves waiting queue | Other user cannot read queue row or submit a turn; abandoned room expires under an active cron job. |
| Private room | migration `0015` | Invited user joins valid code/assignment | Expired, full, wrong-assignment, nonmember, or repeatedly guessed code is denied. |
| Classroom | migrations `0007`–`0014` | Coach creates/publishes/grades; student joins/submits; retries are idempotent | Nonmember cannot see files/grades; student cannot grade or alter rubric; reused request ID cannot duplicate submission. |
| Storage | migrations `0010`–`0012`, `0015` | Authorized owner/coach obtains private asset | Signed URL issuance fails after membership removal; path traversal/wrong prefix and unsupported MIME/size fail. |
| AI/search proxy | Next `api/supabase-functions/route.ts`; Edge handlers | Valid authenticated request reaches allowlisted function | Missing/forged bearer, unknown function/action, huge body, timeout, provider 5xx all return bounded responses. |
| Scheduler | commented SQL setup; cleanup/topic Edge Functions | Jobs run with shared secret at expected cadence | Absent/wrong secret is denied; schedule failure creates an alert; stale rows actually disappear. |

## Data and infrastructure checks still required

1. **Migration replay:** Apply all 16 migrations to an empty project, then to a populated fixture upgraded from an earlier version. Inspect duplicate policy/function conflicts, grants, indexes, and `notify pgrst` behavior. Source review cannot prove SQL replay success.
2. **Role matrix:** Run each RPC/table/storage action as anonymous, student, coach, unrelated signed-in user, and service role. Direct table grants and RLS policies both matter. Repeat after migrations that redefine `SECURITY DEFINER` functions.
3. **Concurrency:** Race two players through matching; race two joins on one private room; submit the same Classroom result twice; grade simultaneously; switch device while progress sync is pending. Assert one durable outcome and no lost updates.
4. **Backup and recovery:** Confirm Supabase backup/point-in-time settings, exportability, restore drill, and retention appropriate to a pilot. No backup configuration was available in this checkout.
5. **Secrets and deployment:** Compare deployed Edge function versions, migration table, CORS origins, and configured provider/cron/email secrets to source without exposing values. Keep a deployment manifest with rollback steps.
6. **Operational load:** Measure p50/p95 provider latency, timeout rate, memory/body size at proxy and Edge, DB lock wait on matchmaking/quota RPCs, Realtime reconnect behavior, and storage growth. Use budgets grounded in pilot data.

## Verification performed and limits

| Check | Result |
| --- | --- |
| Legacy `tsc --noEmit`, `node --check` on seven JS entry/modules, Edge syntax check | Pass. |
| Legacy focused Node tests | Pass: 6/6. |
| React `tsc --noEmit --incremental false` | Pass. |
| React Node tests | Pass: 37/37. |
| Legacy Vitest/Vite build | Blocked by Rollup native module signature mismatch under this macOS/ChatGPT Node runtime; no test assertion or source compile failure observed. |
| Next default build and Webpack fallback | Blocked by unavailable native SWC/Lightning CSS bindings under this runtime; a clean production build remains unverified. |
| Hosted DB, SQL migration apply, RLS negative tests, Edge deployment, providers, email, cron, two-account flows | Not run; require a disposable project and credentials/fixtures. |

## Recommended release sequence

1. Fix progress ownership/reconciliation and add account-switch/dual-device tests.
2. Build an empty disposable Supabase project from migrations 0001–0016; verify grants, RLS, Storage, and Edge contracts with multiple roles.
3. Provision and monitor scheduled jobs from reproducible configuration.
4. Enforce proxy request-size and client timeout boundaries.
5. Define retention/deletion/export behavior for classroom records and recordings.
6. Add current-app CI and a clean build on a standard Node 22 environment; then run real-provider smoke tests with budgets.
7. Add privacy-conscious observability and release-state tracking.
