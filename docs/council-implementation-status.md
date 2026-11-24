# Council audit implementation status

Updated 24 November 2026. This supplements the original audit (`website-council-audit-2026-11-24.txt`), whose feature counts describe the earlier inspection. “Implemented” describes the stated bounded change, not certification or completion of every proposed enhancement. Partial and verification items stay open.

The current frontend is a local production preview. Backend migrations 0017–0021 and the updated AI/search functions have been applied to the linked Supabase project. No public frontend deployment or remote CI success is claimed. Real investigations retrieved sources but verification previously failed with provider 400/429/503 errors. Logs identified schema-complexity rejection; a schema simplification/recovery fix was deployed. The next live check still encountered provider capacity errors and was cancelled, preserving its input/trace. Planning-stage backoff and source-only retry then passed regression tests. No successful live verdict or accuracy claim is made.

## Audit items

| Item | State | Delivered / observed | Remaining work or evidence |
| --- | --- | --- | --- |
| 01 | Implemented | One live timeout clock; server timeout RPC remains authoritative. | Two-account timeout test still needed. |
| 02 | Implemented | Completion denominator uses each student’s eligible cohorts. | Covered by classroom-report tests. |
| 03 | Implemented | Cross-assignment scores normalized against maxima. | Covered by mixed-scale tests. |
| 04 | Implemented | Rubric shown before work and criterion scores after grading. | Real teacher/student UI check remains in 05. |
| 05 | Needs verification | SQL scoring/retry, discussion policy and privacy contracts pass. | Real email delivery, files, speech and two-player UI flows remain. |
| 06 | Implemented; verify live | Room URLs, authorized reload, subscription reconciliation and polling. | Exercise interrupted two-account matches. |
| 07 | Implemented; verify live | Signed recording URLs refresh periodically and on visibility return. | Long-match replay/device check remains. |
| 08 | Implemented | UTC boundary; paused daily runs keep their starting date. | Boundary and late-completion tests pass. |
| 09 | Implemented | Deadline timer retains remaining milliseconds across pause. | Browser verified a 15-second timer resumed at 12. |
| 10 | Implemented | Demo navigation cannot replace the app offline shell. | Service-worker regression test passes. |
| 11 | Implemented | Versioned, bounded static allowlist; API/auth/query responses excluded. | Broader device update tests remain. |
| 12 | Partial | CI defines typecheck, unit tests and production builds; durable SQL contracts added. | Remote CI execution, branch protection and isolated backend/browser CI remain. |
| 13 | Partial | 56 solo questions, including 24 new hypothetical transfer questions. | Expert review, age calibration and server-bank versioning remain; assigned drills keep published 32. |
| 14 | Partial | Ten lessons, with four additional reasoning/transfer lessons. | Expert curriculum review and learner validation remain. |
| 15 | Partial | Summary-to-lesson links, lesson deep links, transfer notices and map-to-debate outline. | A complete measured diagnosis-to-delayed-review sequence remains. |
| 16 | Partial | Exact-turn wording revision, comparison and export without changing the original grade. | Human/AI rubric reassessment and persisted revision portfolios remain. |
| 17 | Needs human evidence | Mastery/AI estimates explicitly described as unvalidated; no fabricated calibration. | Collect teacher-rated examples, agreement/bias analysis and override requirements. |
| 18 | Implemented | Assessment sample count and estimate limitations displayed near mastery. | Coverage/recency use the existing assessment model. |
| 19 | Partial | Existing per-question assessments and spaced Study reviews retained. | Unfamiliar-task retention measurement and misconception dashboard remain. |
| 20 | Existing; partial | Study uses recall success to extend review intervals up to 30 days. | No evidence-based optimal scheduler claimed. |
| 21 | Partial | Durable local libraries, explicit private account backup, download, validated restore and delete. | Automatic multi-device conflict resolution is not implemented. |
| 22 | Partial | Local recent debate portfolio and library/report/revision/citation exports. | Selected sharing permissions, coach annotation and unified revision history remain. |
| 23 | Partial | Saved quotation library supports search, type filters, tags and preserved provenance. | Dedicated topic folders and full-source archiving remain. |
| 24 | Not implemented | Existing lateral-reading lesson retained. | Assignable live publisher/corroboration exercise remains. |
| 25 | Needs human evidence | Quote/scope validation tests retained; provider failures are explicit. | Diverse human-reviewed findings benchmark remains. |
| 26 | Not implemented | No publication/retraction status is invented. | Verified metadata provider and correction-status presentation remain. |
| 27 | Not implemented | Existing question scope is retained in investigation context. | Date/jurisdiction/source-type/population research controls remain. |
| 28 | Not implemented | Users can inspect retained sources and uncertainty. | Versioned human correction/challenge workflow remains. |
| 29 | Implemented | Filtered quote-card JSON, text citation and RIS exports retain excerpt type and quote. | These exports do not certify source validity. |
| 30 | Deferred enhancement | Selectable-text PDF handling retained. | OCR and extraction/page-quality review are not implemented. |
| 31 | Partial | Paper studies can be explicitly saved locally, exported and backed up. | Original PDF binary retention/restore remains separate and unimplemented. |
| 32 | Implemented | Failed AI referee yields no winner/score; transcript and retry remain available. | Live provider availability is still failing in observed evidence checks. |
| 33 | Partial | Original per-turn feedback stays beside the exact argument in revision. | Validated passage-grounded rubric explanations remain. |
| 34 | Partial | Optional recording-duration WPM and English filler cues, clearly separate from scores. | Pause alignment, timestamps and accent/accessibility validation remain. |
| 35 | Partial | Private device transcript/report portfolio and export. | Authorized coach annotations/replay remain. |
| 36 | Deferred enhancement | Core turn/reconnect behavior improved first. | Formal templates and cross-examination are not implemented. |
| 37 | Needs device checks | Existing recording cleanup preserved; URL renewal added. | Mic denial, format/transcription interruption and mobile playback tests remain. |
| 38 | Deferred enhancement | Existing practice format and timing choices retained. | Opt-in speaking goals/feedback focus need design and validation. |
| 39 | Not implemented | Existing attributed suggestions retained. | Searchable age/subject/sensitivity topic packs remain. |
| 40 | Partial | Eligible-cohort completion and normalized score analytics fixed. | Overdue, misconception and criterion trend dashboards remain. |
| 41 | Partial | CSV progress/grade export escapes spreadsheet formulas. | Reusable rubric/topic packs and dedicated roster export remain. |
| 42 | Implemented | Nested claim/reason/evidence/objection/response maps; edit/move/import/export and AI handoff. | No automated validity score is assigned to a map. |
| 43 | Partial | Structured peer reviews use teacher-controlled discussion replies, aliases, moderation and retry-safe posting. | No automatic peer submission sharing or pre-publication approval queue. |
| 44 | Not implemented | Existing return-visit Study reminders retained. | External opt-in reminders, timezone and quiet-hours delivery remain. |
| 45 | Deferred by audit | Exports are available. | LMS/SSO/passback awaits a target school integration request. |
| 46 | Deferred enhancement | Authorized existing classroom submissions remain available to coaches. | Small-group async debate and observation/replay tools remain. |
| 47 | Partial verification | SQL fixtures cover membership, report/block, library and account scope plus private assignment joins. | Full organization/file/role-change matrix and real account UI tests remain. |
| 48 | Partial operational | Report/block UI, private operator queue, two-direction public exclusion, unblock and operator runbook. | Assign a moderation operator, contact and response process. |
| 49 | Partial operational | Processing/storage disclosures; self-declared age band; adult public opt-in; teen teacher-managed private sessions. | Identity verification, school/provider retention decisions and staffed support remain. No legal compliance claim. |
| 50 | Partial operational | Owner-scoped paginated record export and explicit deletion-request/cancellation queue. | Deletion is operator-reviewed, not automatic; shared work/storage/provider retention need reviewed processing. |
| 51 | Not implemented | XP sample standings remain clearly labeled. | Server-validated idempotent XP ledger remains; no genuine public XP competition added. |
| 52 | Partial | Sample XP standings are collapsed; public matching is opt-in for adults. | Cohort/weekly competitive ranking preferences are not implemented. |
| 53 | Implemented | Unplayed profiles excluded; fewer than five rated games labeled provisional. | Existing column-level profile permissions respected. |
| 54 | Implemented | Explicit guest-practice import uses best counters without summing duplicate XP. | Legacy unowned Study notes never auto-migrate into signed-in accounts. |
| 55 | Partial | Durable workspace routes, live room URLs and lesson links; safe transient-state handling. | Durable assignment and individual saved-report routes remain. |
| 56 | Implemented | Public SSR sample lesson and help/data-controls pages with metadata. | No search indexing or traffic performance result claimed. |
| 57 | Partial | Public interactive hypothetical sample reasoning lesson. | Guest investigation/debate report samples remain. |
| 58 | Partial verification | Existing skip/focus behavior retained; semantic forms/details used. | Full keyboard and screen-reader workflow review remains. |
| 59 | Partial verification | Profile and argument-map 320px reflow checks passed; public lesson layout inspected. | Full contrast, zoom, both-theme and touch-target matrix remains. |
| 60 | Implemented | Quick Drills offer 5/15-second and untimed modes; pause keeps remaining time. | Classroom/competitive rules remain distinct. |
| 61 | Implemented | Nearby XP/mastery/ELO/AI provenance and public help explanations. | No unvalidated score is presented as a general ability measure. |
| 62 | Deferred by audit | English content and language-sensitive limitations retained. | Target locales and scoring validation required before localization. |
| 63 | Partial verification | Official Node 22 production webpack builds passed; CI clean-install/build job added. | Hosted CI execution is not yet observed in this session. |
| 64 | Needs deployed traffic | No performance numbers invented. | Real-user 75th-percentile performance measurement requires deployment and a data plan. |
| 65 | Partial | Request IDs, bounded provider phase/error metadata and UI references retained. | End-to-end operational dashboards and queue/transcription timing remain. |
| 66 | Partial; provider blocker | Bounded operation deadlines/retries, cancellation, retained sources, schema recovery after transient errors and planning-stage backoff. | Schema complexity recovery is fixed/deployed; the latest live check still hit provider capacity errors. No billing/tier changes made. |
| 67 | Partial | Sync failure/retry and network retry for practice; drafts retained; private data excluded from SW cache. | A general offline submission outbox is not implemented. |
| 68 | Not implemented | No unrequested learner telemetry deployed. | Define consent/data controls and measurement events before collecting analytics. |
| 69 | Needs participants | Implementation and tests cannot establish learning outcomes. | Teacher/learner pilot and pre/post unfamiliar-task evaluation remain. |
| 70 | Deferred by audit | No speculative paid-school or premium-coaching system added. | Validate reliability, learning value, demand and costs first. |

## Verification

- React TypeScript checks and 63 unit/contract tests passed.
- Next 16.4.6 production webpack build passed with the final queue recovery and audience UI changes.
- The shared vanilla app check/build suite passed earlier in this implementation.
- All three durable database suites passed against the applied schema: account data scope, scoring/discussion idempotency and audience/membership controls. Every fixture transaction rolled back. Tests are in `app/tests/integration/`.
- Browser checks verified map creation/persistence, map-to-AI outline handoff, direct lesson URLs, read-only request status and 320px map reflow. The final browser cancellation check retained the input/trace. The age-preference UI loaded its own backend state with the age band unset and save disabled; no declaration or opt-in was submitted.
- No real incident report, classroom post, account deletion request, age declaration, permission change or microphone recording was submitted during QA. One clearly labeled example map was saved locally for the map test.

## Operational follow-through

`account-data-operations.md` describes the deletion queue, exports and shared-work review. `school-and-moderation-operations.md` describes audience controls, teacher responsibilities and report review. Operators, retention decisions, provider capacity and supervised learner/device tests still need real deployment ownership.
