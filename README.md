# Veritas — Agentic AI Investigation Platform

> **Tech Zephyr 4.0 — Agentic AI Hackathon MVP** at **IIT Bhubaneswar**

Veritas extends traditional AI debate coaching into a **genuinely agentic fact & logic scanner**. Rather than sending a prompt directly to an LLM for an immediate response, Veritas deploys an **autonomous controller loop** that investigates complex claims step-by-step: planning research, selecting tools, evaluating intermediate results, adapting to failures, and synthesizing verified verdicts.

---

## 🏛️ Architecture Overview

```text
               ┌────────────────────────┐
               │    USER PROPOSITION    │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │   AGENT CONTROLLER     │
               └───────────┬────────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│ TOOL REGISTRY   │                 │ AGENT EVALUATOR │
├─────────────────┤                 ├─────────────────┤
│ understand_claim│                 │ - Utility Check │
│ search_web      │                 │ - Quality Rating│
│ analyze_evidence│                 │ - Contradictions│
│ compare_sources │                 │ - Re-planning   │
│ final_verify    │                 └────────┬────────┘
└────────┬────────┘                          │
         │                                   │
         └─────────────────┬─────────────────┘
                           │
                           ▼
              ┌───────────────────────────┐
              │ ADAPTATION & REPLAN ENGINE│
              └────────────┬──────────────┘
                           │
                           ▼
              ┌───────────────────────────┐
              │  LIVE EXECUTION TRACE UI  │
              └────────────┬──────────────┘
                           │
                           ▼
              ┌───────────────────────────┐
              │       FINAL VERDICT       │
              └───────────────────────────┘
```

---

## 🔄 Agentic Decision Loop

The core controller operates on an iterative feedback loop:

```text
Goal → Understand → Plan → Select Action → Execute Tool → Observe Result → Evaluate → Adapt / Replan → Verify → Final Outcome
```

### Deterministic & LLM-Driven Capabilities:
1. **Understand & Decompose (`understand_claim`)**: Deconstructs user claim into 3 testable sub-claims and formulates search vectors.
2. **Multi-Angle Research (`search_web`)**: Retrieves academic, policy, and empirical sources.
3. **Evidence Extraction (`analyze_evidence`)**: Categorizes evidence into supporting vs. opposing points with authority metrics.
4. **Cross-Examination (`compare_sources`)**: Detects conflicts, ambiguities, and alignment across independent sources.
5. **Final Audit (`final_verification`)**: Calculates multi-variable confidence score (0–100%) and renders structured verdict.

---

## ⚡ Real-Time Adaptation Scenarios (Demonstrable Robustness)

Veritas detects intermediate failures and dynamically alters its execution strategy:

### Scenario 1: Primary Search Failure & Recovery
- **Trigger**: Search gateway error or empty result set (`search_failure` mode).
- **Evaluation**: `AgentEvaluator` detects failed step.
- **Adaptation**: Agent logs operational reason: *"Primary search gateway failed. Switching query parameters and retrying search..."*
- **Outcome**: Re-plans search with modified parameters and recovers successfully.

### Scenario 2: Source Contradiction Resolution
- **Trigger**: Source A claims X while Source B claims Y (`conflicting_evidence` mode).
- **Evaluation**: `AgentEvaluator` flags contradiction severity.
- **Adaptation**: Agent logs operational reason: *"Conflicting evidence detected on core claims. Injecting independent verification phase..."*
- **Outcome**: Launches targeted comparative verification before rendering final verdict.

---

## 🛠️ Stack & Integration

- **Frontend**: Vanilla HTML5, CSS3, JavaScript ES modules and Vite (no framework rewrite; existing screens and DOM behavior retained).
- **Backend / AI**: Supabase Edge Functions (`ai-debate`) calling Google Gemini (`gemini-3.1-flash-lite`).
- **Resilience**: Heuristic fallback engine ensures 100% crash-free execution offline or without active API keys.
- **State Management**: Bounded state object (`InvestigationState`) with hard limits:
  - `MAX_AGENT_STEPS = 8`
  - `MAX_SEARCHES = 5`
  - `MAX_SOURCES = 12`
  - `MAX_LLM_CALLS = 8`

---

## Running locally

1. Install Node.js 20.19+ or 22.12+.
2. Run `npm install` in this folder.
3. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (the anon/publishable key only).
4. Apply the SQL migrations in `supabase/migrations/` to your Supabase project.
5. Run `npm run dev` and open the local URL Vite prints.

Set `VITE_SITE_URL` to the public site origin used for invitation links (for
local-only work, `http://localhost:5173` is suitable). Configure the Edge
Function secret `ALLOWED_ORIGINS` as a comma-separated list containing the
exact deployed origin and local development origin. This secret controls CORS
for AI, search, email, and Classroom Edge Functions. Supabase's built-in
`SUPABASE_SERVICE_ROLE_KEY` is used only inside Edge Functions for rate checks;
never put it in a `VITE_` variable. Configure `GEMINI_API_KEY`, `EXA_API_KEY`,
and the optional `EMAIL_PROVIDER_URL`, `EMAIL_PROVIDER_KEY`, and `EMAIL_FROM`
only as Edge Function secrets when those features are enabled.

Use `npm run build` for a production bundle, `npm run typecheck` for the
frontend data-contract check, and `npm run check:js` for JavaScript syntax checks.
Run `npm run test:focused` for API timeout, retry, and user-error mapping tests.
The output is written to `dist/`. Never add service-role or private AI keys to
`.env.local`; Vite exposes variables prefixed with `VITE_` to every browser user.

The source remains plain HTML, CSS, and JavaScript. `src/main.js` is the Vite
entry point and imports the existing feature scripts in dependency order.

## Tests and release checks

```sh
npm ci
npm run check:js
npm run check:edge
npm run typecheck
npm run test:focused
npm run test:unit
npm run test:e2e:install
npm run test:e2e
npm run build
npm run check:assets
npm run test:e2e:pwa
```

Playwright smoke tests mock Supabase and need no account. The PWA browser test
requires the preceding production build and runs through Vite preview. The optional
`npm run test:e2e:credentialed` suite is isolated from normal CI and requires a
dedicated **non-production** Supabase test project, disposable student/coach
accounts, an invitation link and test fixtures. Never point it at production.
GitHub Actions runs smoke tests on each push/PR; `credentialed-e2e.yml` is a
manual workflow using the protected `veritas-e2e-test` environment and its
test-only secrets.

Vitest covers saved practice state, attachment boundaries and AI response
contracts. `npm run assets:optimize` reproducibly converts the authored large
illustrations to quality-90 WebP and generates app icons. `check:assets` reports
every production file and fails on a file larger than 750 KiB. Optional
`VITE_SENTRY_DSN` enables Sentry browser errors and Web Vitals (CLS, INP, LCP);
the monitor strips user identity, request details, breadcrumbs, error text and
stack traces. It is disabled if the variable is empty.

## Storage, migrations and production setup

Apply SQL migrations `0001` through `0013` in order to a test Supabase project
first. Migrations `0010` and `0011` are additive and provide private avatar
and Classroom attachment buckets, access policies, registration/authorization
RPCs and rate quotas. Migration `0012` narrows retryable attachment replacement
to current cohort members and restricts profile progress columns to the
owner-only RPC. Migration `0013` adds request-keyed, retry-safe Classroom
invitation creation and grading without changing existing work. Confirm the Storage service's
`storage.objects.metadata` uses the expected `size` and `mimetype` fields; test
upload, replacement, signed download and denied access as student, coach and
unrelated user before production rollout.

In Supabase Auth, set the public site URL and redirect allowlist for the actual
deployed domain and local Vite origin, including password recovery. Set the
Edge Function secret `ALLOWED_ORIGINS` to the exact comma-separated origins
`https://veritas-vl64.vercel.app,http://localhost:5173` (no paths or trailing
slashes). Add `http://127.0.0.1:4173` only to the isolated test project's
allowlist while running the credentialed local browser suite.
Set provider secrets only in Supabase Edge Function settings, never in Vite:
Gemini and Exa keys, optional email provider URL/key/from, and any enabled
scheduled-task secrets. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only.

Vercel should use Node 22, `npm ci`, `npm run build`, and the `dist` output
directory. Configure only `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and
`VITE_SITE_URL` for the browser build; the anon/publishable key is public.
`VITE_SENTRY_DSN` is optional. Never put service-role, Gemini, Exa or email
provider secrets in any `VITE_` variable. Deploy to a preview first, verify
auth redirects and private attachments there, then use the project's normal
reviewed release process. No production deployment is part of local testing.

The production service worker caches only the public app shell and local app
assets. Supabase auth, REST, Edge Functions, Realtime and Storage requests are
network-only and never enter Cache Storage. Offline messaging is informational;
AI, multiplayer and Classroom still need connectivity.

---

## 🎯 Hackathon Demonstration Workflow

1. Select **"Demo: Search Failure & Self-Recovery"** -> Click **Start Autonomous Investigation**.
   - Observe Step 2 fail -> Watch yellow **ADAPTATION TRIGGERED** card appear live in the trace -> Watch agent re-plan search and finalize verdict.
2. Select **"Demo: Conflicting Evidence Resolution"** -> Click **Start Autonomous Investigation**.
   - Observe Step 4 detect contradiction between sources -> Watch agent inject verification phase -> Observe resolved verdict with confidence breakdown.
