# Veritas release readiness report

## Completed upgrades

- Kept the existing plain HTML/CSS/JavaScript application and its UI flow. Vite
  builds the production bundle; public configuration comes from `VITE_*`
  variables. No service-role, Gemini, Exa, or email-provider secret is exposed
  to the browser.
- Kept local practice progress under its existing localStorage key, Supabase
  authentication and realtime multiplayer behavior. The public page on the
  deployed site was inspected read-only for comparison. No production account,
  setting, secret, database row, or deployment was changed.
- Centralized Supabase table, RPC, Edge Function, Storage and realtime access
  in the browser API client with bounded timeouts, user-readable errors,
  optional safe retries and loading callbacks. Added response validation for
  Gemini debate/referee/drill and Evidence Lab results; deterministic/fallback
  results remain identified as estimates.
- Classroom assignment and student attachments use the private
  `classroom-attachments` bucket. Client checks and Storage bucket rules enforce
  the allowed MIME types and 5 MB limit; paths are collision-safe and scoped to
  the authenticated owner. Metadata is checked before registration, downloads
  use signed URLs after authorization, and deletion/replacement requires the
  applicable cohort access. Existing submission request IDs and grading
  version checks are retained.
- Added migration `0013_idempotent_classroom_invites.sql`: invitation creation
  now accepts a stable request ID and caller-generated random token, hashes
  the token at rest and returns the original invitation on a matching retry.
  Grading uses a dedicated idempotent RPC with private request fingerprints and
  the existing version conflict guard. Email-provider calls use an idempotency
  key. AI/search/email quotas, strict
  Edge Function origin checks and request-ID logging are in place; logs avoid
  tokens, emails, provider keys and private content.
- Tightened profile progress and Classroom/attachment access through additive
  migrations `0010`–`0013`; preserved existing rows and data. Existing debates
  continue to be limited to participants. Review the SQL against the target
  Supabase version and exercise it on a test project before production.
- Added Vitest unit coverage, Playwright smoke and credentialed journeys, Axe
  checks, GitHub Actions CI, an optional privacy-filtered Sentry/Web Vitals
  integration, a web manifest/icons, offline/update messaging and a service
  worker that caches only public shell assets. Auth, REST, Edge, Realtime and
  Storage requests are explicitly excluded from Cache Storage.
- Converted the two large classroom illustrations to quality-90 WebP while
  preserving their original PNG source files and dimensions. Production assets
  remain below the 750 KiB per-file check threshold.
- Updated local setup, test, environment, migration and deployment instructions
  in `README.md` and `.env.example`.

## Changed architecture

- `src/main.js` is the Vite entry point and imports the existing feature
  scripts; the app remains framework-free.
- `src/api/` owns Supabase browser transport and request behavior;
  `src/features/` contains the saved-practice, attachment and AI contracts;
  TypeScript types live under `src/types/`.
- `supabase/functions/_shared/http.ts` implements shared CORS, request IDs,
  user authentication and quota checks. Classroom attachment/invite RPCs and
  access policies are database-enforced.
- Vite emits the production shell worker from `vite.config.js`; `public/`
  contains the manifest and icons. `vercel.json` marks the service worker and
  manifest for revalidation.

## Verification results

- `npm run test:ci` — passed: JavaScript and Edge TypeScript syntax checks,
  frontend TypeScript check, six transport tests, ten Vitest tests and the
  Vite production build.
- `npm run check:assets` — passed. Largest files: JavaScript 182.5 KiB,
  CSS 104.9 KiB, WebP illustrations 154.5/156.5 KiB.
- `npm run test:e2e` — passed: 3 Chromium smoke journeys, including sign-in
  behavior, saved practice persistence, responsive overflow, focus handling
  and Axe checks across auth, home, debate, Evidence Lab and Classroom screens.
- `npm run test:e2e:pwa` — passed: the production-preview shell loads offline
  and private Supabase endpoints do not enter the service-worker cache.
- The credentialed AI and Classroom end-to-end suite (including duplicate
  invitation and grading retries) was added but not run:
  no disposable Supabase test project or test accounts were supplied. It is
  deliberately excluded from ordinary CI and production credentials must not
  be used.
- The deployed public site was inspected without signing in. Its current
  deployment does not yet reflect this local Vite/PWA build. No field Core Web
  Vitals baseline is available; optional Sentry Web Vitals reporting is
  environment-controlled and has no DSN configured here.
- Database migrations and Edge Function runtime behavior were not exercised
  against a live project. No local Supabase/Postgres runtime was configured.

## Required migrations

Apply migrations `0001` through `0013`, in order, to a disposable Supabase
project first. In particular, review/apply the additive migrations:

1. `0010_private_avatars.sql`
2. `0011_reliability_and_classroom_files.sql`
3. `0012_attachment_and_profile_least_privilege.sql`
4. `0013_idempotent_classroom_invites.sql`

Verify Storage `metadata.size` and `metadata.mimetype` match the deployed
Supabase Storage schema. Exercise avatar and Classroom upload, replacement,
signed download, retry, and unauthorized deletion as owner/student/coach and an
unrelated authenticated user. Confirm existing data remains accessible through
the intended policies. Production migration application is a manual reviewed
step and has not happened here.

## Required environment and manual dashboard steps

Local browser build (`.env.local`, copied from `.env.example`):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (anon/publishable key only)
- `VITE_SITE_URL` (for local work use `http://localhost:5173`; invitation links
  use this configured public origin)
- Optional `VITE_SENTRY_DSN` (public DSN only; monitoring stays disabled when
  empty)

Supabase Auth and Edge setup must still be configured on the intended project:

- Set Auth Site URL and redirect allowlist to the deployed origin
  `https://veritas-vl64.vercel.app` and the local development origin, including
  password recovery redirects.
- Set Edge secret `ALLOWED_ORIGINS` to the exact comma-separated origins
  `https://veritas-vl64.vercel.app,http://localhost:5173` (no paths or trailing
  slashes). Add `http://127.0.0.1:4173` only to the isolated test project's
  allowlist for its local credentialed workflow.
- Configure provider secrets only in Supabase Edge Function settings:
  `GEMINI_API_KEY`, `EXA_API_KEY`, optional `EMAIL_PROVIDER_URL`,
  `EMAIL_PROVIDER_KEY`, `EMAIL_FROM`, and existing scheduled-function secrets
  such as `CRON_SECRET` or `AI_REFEREE_SECRET` when those jobs are enabled.
  Supabase's `SUPABASE_SERVICE_ROLE_KEY` stays server-side.
- Deploy/enable Edge Functions and verify the private `avatars` and
  `classroom-attachments` buckets/policies after migrations. No production
  secret changes or function deployment has been made.
- Optional Sentry: set only `VITE_SENTRY_DSN` in Vercel after reviewing the
  privacy filter and the Sentry project's retention/access settings. It strips
  request, user, context, breadcrumb, log-entry and exception text; Web Vitals
  send numeric metrics only.
- Optional credentialed GitHub workflow: create protected GitHub Environment
  `veritas-e2e-test` and add `E2E_SUPABASE_URL`, `E2E_SUPABASE_ANON_KEY`,
  `E2E_STUDENT_EMAIL`, `E2E_STUDENT_PASSWORD`, `E2E_COACH_EMAIL` and
  `E2E_COACH_PASSWORD`. Point it only at a disposable non-production Supabase
  project with migrations, test users and test Edge Function providers ready.

## Deployment checklist

1. Apply `0001`–`0013` to a test project and pass the authenticated storage,
   invitation/grading retry and policy checks. Confirm the target's Auth redirect and
   `ALLOWED_ORIGINS` settings.
2. Run `npm ci`, `npm run test:ci`, `npm run check:assets`, `npm run test:e2e`
   and `npm run test:e2e:pwa`. Run `npm run test:e2e:credentialed` only with the
   dedicated test environment, never production.
3. Configure Vercel with Node 22, `npm ci`, `npm run build`, output directory
   `dist`, and only the public `VITE_*` variables. `vercel.json` must preserve
   revalidation headers on `/sw.js` and `/manifest.webmanifest`.
4. Deploy to a preview through the normal reviewed process. Check sign-in,
   recovery redirects, AI result labeling, invitation origin, attachment
   upload/download/denial, mobile layout, offline shell and update prompt.
   Inspect Core Web Vitals after real traffic if monitoring is enabled.
5. Promote only after review and monitoring are satisfactory. This report does
   not authorize a deployment; none was performed.

## Known limitations

- Credentialed AI and Classroom browser flows and live database RLS/storage
  tests need a dedicated test project and remain unverified. Edge TypeScript is
  syntax-transpiled locally; Deno runtime/type checks were not available.
- The public deployed site is still the previously deployed implementation;
  this local release has not been deployed or compared through authenticated
  production flows.
- No field Web Vitals sample exists. A fresh synthetic Lighthouse/Core Web
  Vitals run was not available in this local environment. JavaScript/CSS/image
  sizes and 375 px horizontal overflow were checked.
- Attachment checks validate declared MIME type and Storage metadata but do
  not scan file contents for malware or verify file signatures. Files are
  limited to 5 MB and PDF/TXT/PNG/JPEG.
- Offline mode covers the application shell and local assets. AI, multiplayer,
  authentication and Classroom require a network connection. The external web
  font is not cached.
- Invitation tokens are temporarily held in tab-scoped session storage to
  support retry. They are removed after successful invitation generation; the
  database stores only their hash.

## Rollback guidance

- If a preview or release is unhealthy, use Vercel's prior-deployment rollback
  procedure. Because a service worker may already be installed on client
  devices, publish a small rollback worker that clears only `veritas-shell-*`
  caches and unregisters itself, with `/sw.js` still set to revalidate; verify
  that path before restoring the previous app-only release.
- Keep the additive database migrations applied during an app rollback. Do not
  drop new columns, indexes, RPCs or buckets as a rollback shortcut: old and
  new frontend versions must be allowed to coexist during recovery. Any schema
  reversal requires a separate reviewed, data-preserving migration.
- Revert the app release first, verify auth and existing Classroom data, then
  separately review any forward fix. Do not rotate secrets or modify production
  data as part of rollback without explicit authorization.

## Exact next steps for the following task

1. Configure an isolated Supabase test project and two disposable accounts;
   apply migrations through `0013` and configure test-only Edge providers and
   `ALLOWED_ORIGINS`.
2. Run `npm run test:e2e:credentialed`; fix any integration issues and verify
   duplicate invite and grading requests return the same committed result.
3. Review RLS and Storage behavior directly in the target Supabase version,
   especially attachment replacement/deletion, profile-column grants and
   Storage metadata shape.
4. Confirm Vercel and Supabase production dashboard values with the owner,
   deploy a preview only after explicit authorization, and collect a real
   Core Web Vitals baseline before making further performance changes.
