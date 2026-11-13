# Evidence Lab

Evidence Lab keeps the submitted claim with its results. It searches the claim as written, then looks for counterevidence and original records. Follow-up searches target unresolved propositions or seek evidence missing from one direction. The activity log records queries, failures, empty results and how many pages and records were retained.

A retrieved page, a passage from that page and the underlying evidence record have separate identities. Tracking variants count as one page. A record counts once even when multiple pages report it. Pages whose relationship to a primary record could not be verified are available to read but cannot influence the verdict.

The assessment checks whether a quotation appears in the saved excerpt and whether the quotation in context supports the interpretation and its stated scope. Open a citation to see the original wording, its limitations and the original page link. The summary and comparison are assembled from validated findings, with citations attached to each interpretation. The app reviews excerpts and does not establish scientific consensus.

A directional verdict requires at least two verified independent records with direct, credible findings for each checked proposition. Direct findings that materially disagree on the same proposition produce a mixed result. Indirect outcomes, weak evidence, an unresolved proposition or an incomplete claim scope can leave the result insufficient. Policy questions show factual premises and trade-offs and leave the policy decision to the reader.

When the initial assessment is unavailable, pages remain browsable and the verdict and findings are withheld. Retry assessment uses the saved claim and exact excerpts. A failed follow-up assessment keeps the last validated evidence and shows the additional pages as unassessed.

## Verification

From `veritas-react/` run `node --test tests/evidence-verification.test.mjs` on Node.js 22.18 or later. The suite uses fixed provider responses and executes the actual response validation, scoring, search and retry controller, Edge dispatch, and React result rendering. The original Vite contracts are exercised with mocked providers. Its own checks run with `npm run test:ci` from `app/`.

The [FEVER dataset examples](https://fever.ai/dataset/fever.html) and the [FEVER paper](https://aclanthology.org/N18-1074/) supply the reference labels in `tests/evidence-evaluation.mjs`. The fixture file keeps each frozen excerpt and flags its human review needs. All three reference snapshots are expected to abstain under Evidence Lab's independent-record rule. One published label is insufficient and two are directional, so this set cannot measure live verdict accuracy. The two interpretations rendered from these snapshots have resolvable quotations and source links. Their semantic adequacy still needs human review. Clearly synthetic fixtures separately test directional verdicts, conflicts, causal proxies, incomplete coverage and abstention.

## Live validation

Deploy the updated `exa-search` and `assess-evidence` Edge Functions before validating the React app against providers. The version 2 assessment actions are separate from the original Vite actions. In a signed-in test session, verify that Exa returns neutral, counterevidence and primary-record results with available link metadata, that Gemini returns a complete passage assessment and audit within the proxy timeout, and that citations, follow-up and assessment-only retry behave correctly. Live source relevance and provenance, model judgment, and latency are not measured by the fixtures.

The exact-quote and scope checks are conservative. An otherwise relevant paraphrase, alternate population label or record with insufficient identity metadata may remain unweighted. Review the excerpt and its original context before drawing a conclusion.
