# Evidence Lab

The React Evidence Lab keeps the submitted claim with its results. It searches OpenAlex for research papers in parallel with Exa's neutral web search, then uses Exa to look for counterevidence and original records. The OpenAlex lookup uses one of the five search calls available per investigation. The remaining slot can be used for Tavily recovery, an official legal search, or a follow-up on an unresolved proposition or missing challenge. Tavily limits the Indian-law fallback to official legislative and court domains. The activity log lists providers, attempted queries, failures and empty results. It shows how many OpenAlex papers included usable abstract text. An OpenAlex error leaves the existing web search and assessment flow available.

A retrieved source, its saved passage and the underlying evidence record have separate identities. Tracking variants count as one web page. Papers are deduplicated by DOI or OpenAlex work ID. A record counts once even when multiple sources report it. Sources whose relationship to a primary record could not be verified are available to read but cannot influence the verdict.

OpenAlex supplies titles, authors, dates, identifiers and available abstracts. The search function reconstructs an abstract from the supplied word positions and saves a bounded excerpt. Metadata-only records remain browsable and cannot support a finding. An abstract can support only what its retrieved text says. The OpenAlex integration retrieves abstracts and metadata only. Web providers supply excerpts, which are labeled as such even when they link to a paper. Evidence Lab does not download publisher PDFs, verify access rights or claim that a linked paper is open access.

The assessment checks whether an exact quotation appears in the saved excerpt and whether the quotation in context supports the interpretation and its stated scope. Paper citations show the title, available authors and year, the exact supporting excerpt and links to the DOI or paper page and the OpenAlex record when distinct. The citation and summary identify abstract text. Web citations continue to link to their original pages. Validated findings supply the evidence summary and comparison.

A directional verdict requires at least two verified independent records with direct, credible findings for each checked proposition. Direct findings that materially disagree on the same proposition produce a mixed result. Indirect outcomes, weak evidence, an unresolved proposition or an incomplete claim scope can leave the result insufficient. Policy questions show factual premises and trade-offs and leave the policy decision to the reader.

When the initial assessment is unavailable, pages remain browsable and the verdict and findings are withheld. Retry assessment uses the saved claim and exact excerpts. A failed follow-up assessment keeps the last validated evidence and shows the additional pages as unassessed.

## OpenAlex configuration

The authenticated Supabase `exa-search` Edge Function calls OpenAlex. Set `OPENALEX_API_KEY` in the project's Edge Function secrets for higher limits. For local Supabase development, put it in the private environment file passed to the functions runtime. OpenAlex permits basic requests without a key under a smaller shared budget. No browser environment variable or database migration is required. [OpenAlex authentication](https://help.openalex.org/api/authentication/)

## Verification

From `veritas-react/` run `node --test tests/evidence-verification.test.mjs` on Node.js 22.18 or later. The suite uses fixed provider responses and executes the actual response validation, scoring, search and retry controller, Edge dispatch, and React result rendering. The original Vite contracts are exercised with mocked providers. Its own checks run with `npm run test:ci` from `app/`.

The [FEVER dataset examples](https://fever.ai/dataset/fever.html) and the [FEVER paper](https://aclanthology.org/N18-1074/) supply the reference labels in `tests/evidence-evaluation.mjs`. The fixture file keeps each frozen excerpt and flags its human review needs. All three reference snapshots are expected to abstain under Evidence Lab's independent-record rule. One published label is insufficient and two are directional, so this set cannot measure live verdict accuracy. The two interpretations rendered from these snapshots have resolvable quotations and source links. Their semantic adequacy still needs human review. Clearly synthetic fixtures separately test directional verdicts, conflicts, causal proxies, incomplete coverage and abstention.

## Live validation

Deploy the updated `exa-search` and `assess-evidence` Edge Functions before validating the React app against providers. The version 2 assessment actions are separate from the original Vite actions. Gemini selects a passage index, and the Edge Function copies the quotation directly from the retained excerpt before auditing the interpretation. This avoids failures caused by the model transcribing punctuation or formatting differently.

For a signed-in smoke test, run a neutral investigation and open a citation. Check the trace for any failed search directions or partial coverage. When retrying a failed assessment, confirm that the existing sources remain visible and that the retry uses the saved excerpts. The fixtures do not measure provider latency or general verdict accuracy.

The exact-quote and scope checks are conservative. An otherwise relevant paraphrase, alternate population label or record with insufficient identity metadata may remain unweighted. Review the excerpt and its original context before drawing a conclusion.
