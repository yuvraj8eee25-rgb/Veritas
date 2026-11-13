# Evidence Lab

The React Evidence Lab starts with a debate motion. **Check a specific claim** optionally narrows the search. It searches OpenAlex and Exa in parallel, then looks for evidence on up to two factual questions behind the motion or looks for counterevidence and original records for a specific claim. The five-call budget includes the OpenAlex lookup and allows for Tavily recovery, an official legal search, or a follow-up on a gap. **Search activity** lists providers, queries, failures and empty results.

A retrieved source, its saved passage and the underlying evidence record have separate identities. Tracking variants count as one web page. Papers are deduplicated by DOI or OpenAlex work ID. A record counts once even when multiple sources report it. Sources whose relationship to a primary record could not be verified are available to read but cannot influence the verdict.

OpenAlex supplies titles, authors, dates, identifiers and available abstracts. The search function reconstructs an abstract from the supplied word positions and saves a bounded excerpt. Metadata-only records remain browsable and cannot support a finding. An abstract can support only what its retrieved text says. The OpenAlex integration retrieves abstracts and metadata only. Web providers supply excerpts, which are labeled as such even when they link to a paper. Evidence Lab does not download publisher PDFs, verify access rights or claim that a linked paper is open access.

The assessment checks whether an exact quotation appears in the saved excerpt and whether the quotation in context supports the interpretation and its stated scope. Paper citations show the title, available authors and year, the exact supporting excerpt and links to the DOI or paper page and the OpenAlex record when distinct. The citation and summary identify abstract text. Web citations continue to link to their original pages. Validated findings supply the evidence summary and comparison.

Results lead with up to three sources with usable excerpts and keep the full source list below the analysis. Motion research groups findings by question. A specific claim groups findings by whether they support, challenge, or provide context for the claim. If analysis is unavailable, students can read the available passages and retry reading those same excerpts.

**Use this quote** preselects an exact passage. Students can choose different wording from the retrieved text, add optional notes, practise immediately, or save for later. Saved quotes keep the citation and excerpt label together and belong to the signed-in account in the current browser tab. They survive a refresh in that tab.

**Practice with this quote** opens a written round in Debate AI. Choose a side, submit an argument, answer one challenge by revising it, then compare the wording in both versions. **Back to Evidence Lab** keeps the search results and **Resume quote practice** restores the current round and both drafts. The `evidence_challenge` and `evidence_feedback` actions check quoted spans against the submitted text before displaying the response. The round uses the existing `ai-debate` function and Gemini configuration, with no database migration.

## OpenAlex configuration

The authenticated Supabase `exa-search` Edge Function calls OpenAlex. Set `OPENALEX_API_KEY` in the project's Edge Function secrets for higher limits. For local Supabase development, put it in the private environment file passed to the functions runtime. OpenAlex permits basic requests without a key under a smaller shared budget. No browser environment variable or database migration is required. [OpenAlex authentication](https://help.openalex.org/api/authentication/)

## Verification

From `veritas-react/` run `node --test tests/evidence-verification.test.mjs` on Node.js 22.18 or later. The suite uses fixed provider responses and executes the actual response validation, scoring, search and retry controller, Edge dispatch, and React result rendering. The original Vite contracts are exercised with mocked providers. Its own checks run with `npm run test:ci` from `app/`.

The [FEVER dataset examples](https://fever.ai/dataset/fever.html) and the [FEVER paper](https://aclanthology.org/N18-1074/) supply the reference labels in `tests/evidence-evaluation.mjs`. The fixture file keeps each frozen excerpt and flags its human review needs. All three reference snapshots are expected to abstain under Evidence Lab's independent-record rule. One published label is insufficient and two are directional, so this set cannot measure live verdict accuracy. The two interpretations rendered from these snapshots have resolvable quotations and source links. Their semantic adequacy still needs human review. Clearly synthetic fixtures separately test directional verdicts, conflicts, causal proxies, incomplete coverage and abstention.

## Live validation

Use preview deployments of `exa-search`, `assess-evidence` and `ai-debate` before validating the React app against live providers. The version 2 assessment actions are separate from the original Vite actions. Gemini selects a passage index, and the Edge Function copies the quotation directly from the retained excerpt before auditing the interpretation.

For a signed-in smoke test, select a passage that explicitly reports an association. Build a card and submit an argument that overstates the result as causal. Check that the AI challenges the overstatement, then revise the argument to preserve the scope and report the association. Check that citation feedback identifies the original wording and the exact passage. For a pilot, use the same rubric across comparable rounds and track unsupported claims and citation accuracy.

The exact-quote and scope checks are conservative. An otherwise relevant paraphrase, alternate population label or record with insufficient identity metadata may remain unweighted. Review the excerpt and its original context before drawing a conclusion.
