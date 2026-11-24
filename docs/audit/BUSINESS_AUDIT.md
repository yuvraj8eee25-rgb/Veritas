# Veritas business and product audit

**Snapshot:** 20 November 2026, local `main` checkout. This reviews the working tree, including uncommitted changes. It is a product and business-model audit of repository evidence, **not** a market study, financial forecast, legal opinion, or verification of a deployed service. See [FRONTEND_AUDIT.md](FRONTEND_AUDIT.md) and [BACKEND_AUDIT.md](BACKEND_AUDIT.md) for implementation findings.

## Executive assessment

Veritas already contains a substantial practice product: four short drills, daily and arcade loops, AI debate, evidence investigation, study paths, live debate, and a coach/classroom workflow. The code demonstrates a plausible educational loop: **learn a reasoning skill → practise it → receive feedback → apply it in a debate or assignment**. The strongest differentiator visible in the code is the link between debate practice, evidence work, and coach assignments rather than any single AI verdict.

The main business risk is **breadth before validation**. The product currently serves at least three distinct jobs—individual practice, live peer debate, and classroom administration—without a stated primary customer, purchase path, success metric, or operating-cost model in the repository. The shipped Home screen offers only a generic next step, and provider-backed flows still need authenticated end-to-end verification. This makes it difficult to know which feature should be finished, measured, and sold first.

### Priority legend

| Priority | Meaning |
| --- | --- |
| P0 | Must resolve before claiming safe production readiness or inviting real classrooms at scale. |
| P1 | Material to product trust, repeat use, or pilot economics. |
| P2 | Improves conversion, clarity, or operating discipline after the core pilot is sound. |

## What the repository actually offers

| Capability | User value | State evidenced by source | Business implication |
| --- | --- | --- | --- |
| Guest practice and four drills | Low-friction first success | `veritas-react/src/features/screens/AuthScreen.tsx:64`, `PracticeSetupScreen.tsx`, `practice-questions.ts` | Good acquisition path; question banks have 7–9 items per drill in the observed guest screen, limiting repeated-use depth. |
| Daily Challenge and Arcade | Reasons to return | `veritas-react/src/App.tsx:645-709`, `src/features/arcade.ts`, `ArcadeDashboard.tsx` | Retention mechanics exist, but progress lives locally and can be lost or mixed between accounts. |
| Study | Structured learning and transfer | `veritas-react/src/features/Study.tsx`, `app/src/features/study-content.js` | Useful bridge between isolated questions and full arguments; effectiveness is not measured in the repo. |
| AI debate and speech | Safe rehearsal and feedback | `veritas-react/src/App.tsx:984-1177`, `app/supabase/functions/ai-debate/index.ts` | High perceived value and variable provider cost; actual quality, latency, and cost per completed debate are not evidenced. |
| Evidence Lab | Source-based argument checking | `veritas-react/src/lib/evidence-investigation.ts`, `app/supabase/functions/assess-evidence/index.ts` | Potential differentiation, but the word “verified” must reflect what was actually checked and preserve uncertainty. |
| Live 1v1/private rooms | Peer practice and ratings | `veritas-react/src/App.tsx:817-981`, migrations `0001`, `0004`, `0015`, `0016` | Requires enough simultaneous users, reliable matchmaking, moderation, and operational jobs. |
| Classroom | Coach distribution, assignments, grading | `veritas-react/src/features/Classroom.tsx`, migrations `0007`–`0015` | Strong possible buyer route, but invites, role boundaries, submission reliability, and support burden need a real pilot. |
| Club preview | Demonstration | `veritas-react/public/demo/` | Browser-only sample should remain explicitly labelled; it is not proof of a live club product. |

The current app is `veritas-react/`; `app/` is the original Vite app and supplies shared code (`README.md:3`, `veritas-react/src/App.tsx:14-16`). Both must be maintained until shared logic is extracted or the original implementation is retired deliberately.

## Business findings

### B-01 · P1 · No primary customer or buying motion is defined

**Evidence.** `README.md` calls Veritas a debate practice platform; `app/README.md:5-9` presents it as an agentic fact-and-logic scanner; the current Home screen promotes short practice, AI debate, and Classroom side by side (`veritas-react/src/features/screens/HomeScreen.tsx:23-55`). `veritas-react/docs/ROADMAP.md` prioritizes a visual demo, then many feature redesigns. I found no repository document specifying a primary buyer, target institution, pricing, purchase process, or pilot acceptance criteria.

**Why it matters.** A learner deciding whether to practise, a coach assigning work, and a school purchasing software evaluate different outcomes. A broad product can be useful, but the team cannot reliably prioritize its next month of work without choosing whose success determines launch readiness.

**Decision to make.** Choose one initial wedge. A sensible **hypothesis to test**, not a proven market fact, is a coach-led pilot in one or two debate classrooms: it has a defined assignment workflow, repeated usage, and an adult who can assess student work. An individual self-serve practice wedge is also viable if activation and return use are stronger. Record the chosen persona, their exact job, current alternative, and why Veritas is better in a one-page positioning brief.

### B-02 · P1 · The first-use promise does not yet lead to a measured outcome

**Evidence.** Guest onboarding is one click (`AuthScreen.tsx:58`). Home says “Ready to practice?” and offers a baseline drill (`HomeScreen.tsx:23-38`). The guest practice screen was observed to show four formats and 7–9 questions per bank. There is no current-app analytics instrumentation; `app/src/monitoring.js` is only imported by the original Vite entry (`app/src/main.js:4`).

**Impact.** The product cannot distinguish a successful learner from a visitor who clicked once. The existing XP, streak, and daily mechanics measure activity, but the stated educational promise is stronger reasoning. They are not the same thing.

**Action.** Define activation as a completed first drill **plus** review of feedback, then one meaningful transfer action within seven days (e.g., a revised argument, evidence card, debate turn, or classroom submission). Instrument privacy-conscious counts and timestamps for these steps. Avoid collecting raw argument text in generic analytics.

### B-03 · P1 · Question-bank depth and content quality constrain retention

**Evidence.** `veritas-react/src/features/practice-questions.ts` contains fixed banks; the running guest setup displayed 9 Fallacy, 7 Rebuttal, 9 Quick Drill, and 7 Steelman questions. `App.tsx:556-578` shuffles from those banks, and daily/arcade reuse practice. `app/src/features/study-content.js` supplies hand-authored lessons.

**Impact.** A repeat learner can memorize questions. Then a rising score may mean recall rather than improved transfer. This weakens the value of mastery, streak, and classroom drill assignments.

**Action.** Version every question and explanation; add content review by a subject-matter educator; maintain a larger pool per skill/difficulty; hold out unseen assessment items; track item difficulty, ambiguity reports, and repeated exposure. Do not use AI-generated questions as scored items without editorial review.

### B-04 · P0 · Account-level progress and “mastery” are not reliable product claims yet

**Evidence.** All practice progress uses one browser key (`app/src/features/practice-state.js:3,34-49`). The React app loads that key at startup and sends the value to whichever signed-in profile becomes ready (`veritas-react/src/App.tsx:165,433-468`). `sync_profile` accepts the client-provided JSON without scoring validation (`app/supabase/migrations/0006_reconcile_profiles.sql:122-146`). The React README itself calls mastery an estimate and XP standings sample (`veritas-react/README.md`, “Remaining parity work”).

**Impact.** Guest and different signed-in users on one device can share or overwrite progress. XP and “mastery” are therefore unsuitable as school reports, certificates, competitive awards, or verified outcomes. ELO is separate and server-managed; the XP leaderboard UI correctly labels sample entries (`LeaderboardScreen.tsx:28-35`).

**Action.** Give progress an owner key and an explicit guest-to-account transfer flow; reconcile local and server versions rather than blindly uploading. Treat current mastery as a coaching estimate and show its basis. If the business requires auditable outcomes, score attempts server-side with item/version IDs and use a held-out assessment.

### B-05 · P1 · Provider costs and quota limits lack a unit-economics model

**Evidence.** AI debate and transcription use Gemini (`app/supabase/functions/ai-debate/index.ts:56-80,260-274`); evidence work calls search providers and Gemini (`exa-search/index.ts`, `assess-evidence/index.ts`). Quotas exist: AI debate 20 requests/10 minutes (`ai-debate/index.ts:280`), evidence 30/10 minutes, and search has a configurable window (`app/supabase/functions/_shared/http.ts:59-78`). No per-session cost ledger, budget, billing, or pricing model appears in the repository.

**Impact.** A single “debate” or “investigation” can contain multiple provider calls. Rate limits reduce abuse but do not answer whether active users or a classroom pilot can be served economically.

**Action.** Track request count, model, token usage where available, provider charge, retries, and completion outcome by feature (using pseudonymous IDs and no raw content). Calculate p50/p95 cost and latency for a completed debate and investigation. Set pilot budgets and feature-level caps before opening access widely.

### B-06 · P0 · Classroom use needs a documented privacy and safety operating model

**Evidence.** Classroom stores membership, assignments, submissions, grades, discussions, and attachments (`app/supabase/migrations/0007_classrooms.sql` through `0015_training_and_speech.sql`). Recorded speech is uploaded to a private bucket (`0015_training_and_speech.sql:220-250`). Auth only shows a generic respectful-use sentence on signup (`AuthScreen.tsx:56`); I found no project privacy, terms, retention, consent, report-abuse, account deletion, or school/guardian-facing policy file. This is a repository-documentation finding, not a legal compliance verdict.

**Impact.** Coaches and learners need to know who can read recordings and submissions, how long they persist, how to remove them, and how to report harmful content. Schools will ask these questions before a pilot.

**Action.** Decide permitted age groups and pilot jurisdictions with counsel; publish clear privacy/terms and a coach data guide; implement and test deletion/export/retention requests and moderation escalation; define recording retention and transcript visibility. Get explicit consent around microphone capture and AI processing in the actual user flow.

### B-07 · P1 · External quality and reliability claims exceed verified evidence

**Evidence.** `app/README.md:5-9,89-101` uses “verified verdict” and an “agentic” investigation description. `veritas-react/README.md` marks most migration items complete while “Remaining parity work” explicitly says authenticated Classroom, invitation email, live multiplayer, speech, and provider-backed AI/evidence still need end-to-end checks. The local test suite covers many evidence contracts, but not provider accuracy, calibrated confidence, or real classroom outcomes.

**Impact.** Users may read a confidence percentage as factual certainty. Trust is at risk if a technically valid search still misses crucial sources, if the model misinterprets a passage, or if a fallback estimate is mistaken for an AI referee result.

**Action.** Use copy such as “evidence review” or “source-based assessment” unless the exact validation level is explained. Keep the trace and citations prominent, state missing evidence and policy-versus-fact limits, and label local estimates. Build an evaluation set with independent human judgments and measure abstention, citation validity, and false-confidence rate before any accuracy claim.

### B-08 · P2 · No go-to-market or feedback operating cadence is visible

**Evidence.** Product docs focus on implementation and visual redesign (`veritas-react/docs/ROADMAP.md`, feature docs). There is no visible pilot plan, interview notes, support workflow, pricing experiment, public release checklist, or product analytics in this checkout.

**Action.** Run a small consented pilot with defined start/end dates, weekly coach interviews, learner feedback after practice, and a decision meeting. Keep a decision log for assumptions, observed behavior, and changes. Do not infer market demand from the existence of features.

## Proposed measurement framework

These are **recommended definitions**, not existing telemetry or targets:

| Layer | Measure | Reason / guardrail |
| --- | --- | --- |
| Acquisition | Visitors who begin guest practice; coach invites accepted | Separates individual and classroom channels. |
| Activation | First drill completed; explanation viewed; first transfer action | Tests the learning loop, not just a page visit. |
| Retention | Learners completing a meaningful session in week 2 and week 4; coaches creating a second assignment | Tests repeated value on both sides. |
| Learning | Improvement on unseen, versioned items; revision quality judged by a blind rubric | Avoids mistaking memorization or XP for skill growth. |
| Reliability | Completion rate and p95 latency by AI/search/classroom flow; retry rate | Measures whether the promise survives real network/provider conditions. |
| Trust | Citation validity, reviewer disagreement, harmful-output reports, deletion requests fulfilled | Essential for education and evidence claims. |
| Economics | Provider cost and support time per active learner/classroom | Needed before pricing or wide distribution. |

Set numerical targets only after a baseline pilot. Use aggregated/pseudonymous event data, minimal retention, and separate consent for any content review.

## Customer and value-chain decisions to resolve

| Candidate entry point | User and possible buyer | Value to prove | Main constraint | Pilot evidence needed |
| --- | --- | --- | --- | --- |
| Individual practice | Learner; learner/parent may pay | A quick, repeatable way to improve argument quality | Small fixed question banks; uncertain willingness to pay; AI costs | First-session completion, week-4 return, unseen-item gains, cost per retained learner. |
| Coach-led classroom | Learner uses; coach/school may buy | Less work to assign, review, and give useful feedback | Privacy, moderation, role/access confidence, support load | Two-account workflows, coach time saved, assignment completion, school approval conditions. |
| Evidence research | Debater/researcher may pay | Better source discovery and more calibrated claims | Provider quality/cost, domain-dependent accuracy, trust | Citation audit, user corrections, abstention rate, time saved against current workflow. |
| Live debate community | Learner uses; buyer uncertain | Real opponents and competitive motivation | Match liquidity, moderation, time-zone clustering | Wait time, completed-match rate, reports, repeat matches. |

The table is a set of **hypotheses for testing**. The repository does not supply demand, price sensitivity, market-size, or competitor data. Bundling all four entry points into a single launch message would make conversion experiments hard to interpret.

## Product and operating risks by journey

1. **Guest → account:** Guest exploration is easy, but the single progress key makes transfer implicit and unsafe on a shared device. The account creation prompt should explain what will transfer, then let the learner confirm it.
2. **Practice → improvement:** Current explanation-after-answer and study transfer are promising. Measure whether users can produce a stronger argument on unseen material, not just whether XP rises.
3. **Learner → coach:** Classroom already supports many real workflow objects. Pilot success should include coach setup time, grading time, missed submission rate, and learner understanding of feedback. Feature count is not a substitute for workload reduction.
4. **AI answer → user trust:** AI debate, research, and referee features have different certainty levels. Use separate language for sourced findings, generated opposition, and heuristic fallback. A provider outage should not silently become a “verdict.”
5. **Live debate → healthy community:** Public matchmaking creates a community and moderation obligation. Define age/identity rules, prohibited conduct, reporting, and response ownership before scale.
6. **Provider usage → sustainable access:** Quotas exist but should be paired with per-completed-session economics and a graceful limit message. Pricing should not be set without these costs.

## Pilot and launch gates

1. **Choose the wedge and claim.** Name one primary user/buyer and one measurable outcome. Write a concise promise that the current product can substantiate.
2. **Fix progress ownership (P0).** Test guest → signup, account A → sign-out → account B, two devices, and offline → online reconciliation.
3. **Establish trust operations (P0).** Document who can access classroom records and speech, how to delete/export, consent requirements, and moderation response.
4. **Verify the paid-provider journey (P1).** Complete real signed-in AI debate/evidence runs and two-account Classroom/live flows in a non-production project; record failures and actual costs.
5. **Measure a small pilot (P1).** Track activation, repeat use, unseen-item improvement, coach workload, and adverse feedback before broadening scope.
6. **Only then test pricing/channel (P2).** Compare an institution-paid classroom pilot with a self-serve route using real adoption and cost data.

## Evidence limits

- No external customer interviews, traffic, conversion, revenue, costs, or market sizing were available; none is invented here.
- Deployment claims in `veritas-react/README.md` were not verified against hosted Supabase or production DNS.
- The current UI was inspected in a running guest session. Real accounts, microphone access, payment, and provider calls were not exercised.
- Absence of a policy or workflow **in this repository** does not prove that the organization lacks one elsewhere.
