import {
  canonicalPageUrl,
  fallbackPlan,
  isDirectStatutoryText,
  isOfficialIndianLawPage,
  MAX_EVIDENCE_PAGES,
  object,
  readAssessment,
  readPlan,
  readSearchPages,
  resolverIdentity,
  terms,
  VERIFICATION_VERSION,
} from "../../../app/supabase/functions/_shared/evidence-verification.ts";
import type { Assessment, Finding, Page, Plan } from "../../../app/supabase/functions/_shared/evidence-verification.ts";

export const MAX_SEARCHES = 5;
export const MAX_ASSESSMENT_CALLS = 8;
const ASSESSMENT_BATCH_SIZE = 4;
const MAX_CONCURRENT_ASSESSMENTS = 1;

export type EvidenceRequest = (
  name: "assess-evidence" | "exa-search", body: Record<string, unknown>, signal?: AbortSignal,
) => Promise<unknown>;
export type SearchDirection = "Neutral" | "Research papers" | "Counterevidence" | "Primary records" | "Research question" | "Missing proposition" | "Recovery";
type Query = { direction: SearchDirection; text: string; provider?: "exa" | "tavily" | "openalex" };
export type SearchLog = Query & {
  state: "failed" | "limited" | "skipped" | "empty" | "retrieved";
  pageIds: string[];
  textCount?: number;
  error?: string;
};
export type TraceStep = { title: string; notes: string[]; phase?: "Finding sources" | "Reading excerpts" };
export type Snapshot = {
  claim: string;
  plan: Plan;
  pages: Page[];
  selected: Page[];
  searches: SearchLog[];
  calls: number;
  paperAssessmentNeedsUpdate?: boolean;
  providerBackoff?: boolean;
  planningNeedsRetry?: boolean;
  researchMode?: "claim" | "motion";
};
type Status = "supported" | "refuted" | "mixed" | "insufficient";
export type CitedFinding = { page: Page; finding: Finding; targetText: string; recordId: string | null };
type TargetResult = {
  target: Plan["targets"][number];
  status: Status;
  supporting: CitedFinding[];
  challenging: CitedFinding[];
};
export type Review = {
  status: Status;
  reason: string;
  findings: CitedFinding[];
  summary: CitedFinding[];
  targets: TargetResult[];
  records: { id: string; primary: CitedFinding; pages: Page[]; contributes: boolean }[];
  independentCount: number;
  weightedCount: number;
  conflictingRecords: CitedFinding[][];
};
export type Investigation =
  | { state: "search-failed" | "empty"; snapshot: Snapshot; reason: string }
  | { state: "unavailable"; snapshot: Snapshot; reason: string }
  | { state: "complete"; snapshot: Snapshot; assessments: Assessment[]; review: Review; caveats: string[] };
export type AssessmentResult = Extract<Investigation, { state: "complete" | "unavailable" }>;

const strengthWeight = { strong: 2, moderate: 1, weak: 0 };
const sourceError = (error: unknown) => error instanceof Error ? error.message : "The service did not respond.";
const searchLimitMessage = "Evidence Lab reached its search limit. Wait a few minutes before starting another investigation.";

function assessmentHitLimit(error: unknown) {
  const status = object(error)?.status;
  return status === 546 || status === 504;
}

function assessmentError(error: unknown) {
  if ([429, 503].includes(Number(object(error)?.status))) return `${sourceError(error)} Your retrieved sources remain available.`;
  if (error instanceof LegacyAbstractAssessmentError) return error.message;
  return assessmentHitLimit(error)
    ? "The assessment service stopped before it could finish. You can still read and use the retrieved excerpts below."
    : "The assessment service could not verify the findings. You can still read and use the retrieved excerpts below.";
}

class LegacyAbstractAssessmentError extends Error {
  constructor() {
    super("The assessment service needs an update to check research abstracts. You can still read and quote the retrieved excerpts.");
  }
}

export function mergePages(pages: Page[], scope: string): Page[] {
  const unique = new Map<string, Page>();
  for (const page of pages) {
    const previous = unique.get(page.id);
    if (!previous) { unique.set(page.id, page); continue; }
    const hasText = Boolean(page.passage.text.trim());
    const hadText = Boolean(previous.passage.text.trim());
    const preferNew = hasText !== hadText ? hasText
      : !hasText && page.passage.scope !== previous.passage.scope ? page.passage.scope === "metadata only"
      : pagePriority(page, scope) > pagePriority(previous, scope);
    const best = preferNew ? page : previous;
    const paper = best.paper ?? (resolverIdentity(best.id)?.startsWith("doi:") ? previous.paper ?? page.paper : undefined);
    const links = previous.passage.id === page.passage.id
      ? [...new Set([...previous.links, ...page.links])].slice(0, 30) : best.links;
    unique.set(page.id, { ...best, ...(paper ? { paper } : {}), links });
  }
  return [...unique.values()];
}

function pagePriority(page: Page, scope: string): number {
  const wanted = terms(scope);
  const title = terms(page.title);
  const passage = terms(page.passage.text);
  const matching = [...wanted].reduce((score, word) => score + Number(title.has(word)) + 2 * Number(passage.has(word)), 0);
  // Use retrieval signals for selection only. They never determine independence or a stance.
  return matching + 4 * Number(Boolean(page.passage.text.trim())) + 3 * Number(Boolean(resolverIdentity(page.id)))
    + 7 * Number(/\b(?:constitution|article|statute)\b/i.test(scope) && isOfficialIndianLawPage(page))
    + Number(Boolean(page.date)) + Math.min(page.passage.text.length, 800) / 800;
}

export function selectPages(pages: Page[], plan: Plan, claim: string, limit = MAX_EVIDENCE_PAGES, reviewed: CitedFinding[] = []): Page[] {
  const scope = [claim, ...plan.targets.map(target => target.text)].join(" ");
  const confirmed = new Set(reviewed.filter(entry =>
    entry.recordId && entry.finding.match === "direct" && entry.finding.strength !== "weak"
  ).map(entry => entry.page.passage.id));
  const pool = mergePages(pages, scope).filter(page => page.passage.text.trim());
  const ranks = plan.targets.map(target => pool.map(page => ({
    page, score: pagePriority(page, target.text) + 4 * Number(confirmed.has(page.passage.id)),
  })).sort((a, b) => b.score - a.score));
  const selected = new Map<string, Page>();
  // Keep a scholarly passage in the assessment even when the web results fill the batch.
  const scholarly = pool.filter(page => page.passage.scope === "abstract")
    .sort((a, b) => pagePriority(b, scope) - pagePriority(a, scope));
  for (const page of scholarly.slice(0, Math.min(2, limit))) selected.set(page.id, page);
  for (let index = 0; index < pool.length && selected.size < limit; index++) {
    for (const rank of ranks) {
      const page = rank[index].page;
      if (!selected.has(page.id)) selected.set(page.id, page);
      if (selected.size >= limit) break;
    }
  }
  return [...selected.values()];
}

function priority(entry: CitedFinding): number {
  const { page, finding } = entry;
  return 12 * Number(finding.match === "direct") + 4 * strengthWeight[finding.strength]
    + 3 * Number(finding.record?.relation === "primary") + Math.min(finding.quote.length, 650) / 650
    + 0.1 * Number(Boolean(page.date));
}

function recordKey(url: string): string {
  return resolverIdentity(url) ?? `record:${url}`;
}

function groupFindings(pages: Page[], assessments: Assessment[], plan: Plan): CitedFinding[] {
  const byPage = new Map(pages.map(page => [page.id, page]));
  const targetTexts = new Map(plan.targets.map(target => [target.id, target.text]));
  const parents = new Map<string, string>();
  const find = (key: string): string => {
    let current = key;
    while (parents.has(current) && parents.get(current) !== current) current = parents.get(current)!;
    return current;
  };
  const findings = assessments.flatMap(assessment => {
    const page = byPage.get(assessment.id);
    return page ? assessment.findings.map(finding => ({ page, finding })) : [];
  });
  const primaryEntries = findings.filter(entry => entry.finding.record?.relation === "primary");
  const ambiguousPages = new Set<string>();
  const primaryKeys = new Map<string, Set<string>>();
  const identicalProofs = new Map<string, { id: string; explicit: boolean }[]>();
  for (const { page, finding: { record } } of primaryEntries) {
    if (!record) continue;
    const keys = new Set([recordKey(record.url), ...record.aliases.map(recordKey)]);
    const earlier = primaryKeys.get(page.id);
    if (earlier && ![...earlier].some(key => keys.has(key))) ambiguousPages.add(page.id);
    else primaryKeys.set(page.id, new Set([...(earlier ?? []), ...keys]));
    const proof = record.proof.toLowerCase().replace(/\s+/g, " ");
    if (terms(proof).size >= 9) {
      const appearances = identicalProofs.get(proof) ?? [];
      appearances.push({ id: page.id, explicit: [...keys].some(key => !key.startsWith("record:")) });
      identicalProofs.set(proof, appearances);
    }
  }
  for (const appearances of identicalProofs.values()) {
    if (new Set(appearances.map(entry => entry.id)).size < 2) continue;
    // Reproduced prose cannot establish that canonical URLs represent different originals.
    for (const entry of appearances) if (!entry.explicit) ambiguousPages.add(entry.id);
  }
  for (const { page, finding: { record } } of primaryEntries) {
    if (!record || ambiguousPages.has(page.id)) continue;
    const key = recordKey(record.url);
    const root = find(key);
    parents.set(root, root);
    for (const url of [page.id, ...record.aliases]) {
      const alias = find(recordKey(url));
      if (alias !== root) parents.set(alias, root);
    }
  }
  // Count copies at the paper's known landing page and provider record only once.
  for (const { page, finding: { record } } of primaryEntries) {
    const { paper } = page;
    if (!record || !paper || recordKey(record.url) !== recordKey(page.id) || ambiguousPages.has(page.id)) continue;
    const root = find(recordKey(record.url));
    for (const url of [paper.providerUrl, paper.landingUrl]) {
      if (!url || !parents.has(recordKey(url))) continue;
      const alias = find(recordKey(url));
      if (alias !== root) parents.set(alias, root);
    }
  }
  const primaryTitles = new Map<string, string[]>();
  for (const { page, finding: { record } } of primaryEntries) {
    if (!record || ambiguousPages.has(page.id)) continue;
    const root = find(recordKey(record.url));
    primaryTitles.set(root, [...(primaryTitles.get(root) ?? []), page.title.toLowerCase().replace(/\s+/g, " ")]);
  }
  return findings.map(({ page, finding }) => {
    const key = finding.record ? recordKey(finding.record.url) : null;
    const root = key && parents.has(key) ? find(key) : null;
    const title = finding.record?.title?.toLowerCase().replace(/\s+/g, " ");
    const confirmed = root && (!title || primaryTitles.get(root)?.some(primary => primary.includes(title)));
    return {
      page, finding, targetText: targetTexts.get(finding.targetId) ?? "",
      recordId: confirmed && !ambiguousPages.has(page.id) ? root : null,
    };
  }).sort((a, b) => priority(b) - priority(a));
}

function strongestByRecord(findings: CitedFinding[], stance: "supports" | "contradicts") {
  const seen = new Set<string>();
  return findings.filter(({ finding, recordId }) => {
    if (!recordId || seen.has(recordId) || finding.stance !== stance
      || finding.match !== "direct" || finding.strength === "weak") return false;
    seen.add(recordId);
    return true;
  });
}

export function reviewEvidence(snapshot: Snapshot, assessments: Assessment[]): Review {
  const findings = groupFindings(snapshot.selected, assessments, snapshot.plan);
  const targets = snapshot.plan.targets.map((target): TargetResult => {
    const relevant = findings.filter(item => item.finding.targetId === target.id);
    const supporting = strongestByRecord(relevant, "supports");
    const challenging = strongestByRecord(relevant, "contradicts");
    const directlyStatesProvision = (entries: CitedFinding[]) => entries.some(entry =>
      isDirectStatutoryText(entry.page, entry.finding, target)
    );
    const status = supporting.length && challenging.length ? "mixed"
      : supporting.length >= 2 || directlyStatesProvision(supporting) ? "supported"
      : challenging.length >= 2 || directlyStatesProvision(challenging) ? "refuted" : "insufficient";
    return { target, status, supporting, challenging };
  });
  const recordIds = new Set(findings.flatMap(finding => finding.recordId ? [finding.recordId] : []));
  const weighted = new Set(targets.flatMap(target => [...target.supporting, ...target.challenging].map(item => item.recordId)));
  const records = [...recordIds].flatMap(id => {
    const entries = findings.filter(entry => entry.recordId === id);
    const primary = entries.find(entry => entry.finding.record?.relation === "primary");
    const pages = [...new Map(entries.map(entry => [entry.page.id, entry.page])).values()];
    return primary ? [{ id, primary, pages, contributes: weighted.has(id) }] : [];
  });
  const conflictingRecords = targets.flatMap(({ supporting, challenging }) => supporting.flatMap(positive => {
    const negative = challenging.find(entry => entry.recordId === positive.recordId);
    return negative ? [[positive, negative]] : [];
  }));
  const status: Status = snapshot.plan.policy ? "insufficient"
    : targets.some(target => target.status === "mixed") ? "mixed"
    : snapshot.plan.complete && targets.every(target => target.status === "supported") ? "supported"
    : snapshot.plan.complete && targets.every(target => target.status === "refuted") ? "refuted" : "insufficient";
  const reason = snapshot.plan.policy ? "The review checks factual premises and trade-offs. The policy decision is yours."
    : status === "mixed" ? "Direct findings disagree on the same checked proposition."
    : (status === "supported" || status === "refuted") && targets.some(target => target.supporting.length + target.challenging.length === 1)
      ? "The official text directly addresses the named provision. This verdict applies to that provision."
    : status === "supported" || status === "refuted" ? "At least two independent records directly address each checked proposition in the same direction."
    : !snapshot.selected.length ? "The searches returned source records without passages that could be assessed."
    : !snapshot.plan.complete ? "The checked scope could not be confirmed for the whole claim."
    : targets.length > 1 ? "The checked propositions do not all reach the same conclusion."
    : "A directional verdict needs at least two independent records with direct, credible findings on this question.";
  const representatives = new Map<string, CitedFinding>();
  for (const item of findings) {
    const { finding, page, recordId } = item;
    // Keep opposite findings and separate propositions even when they come from one record.
    const key = JSON.stringify([recordId ?? page.id, finding.targetId, finding.stance, finding.match]);
    if (!representatives.has(key)) representatives.set(key, item);
  }
  const strongest = targets.flatMap(target => [target.supporting[0], target.challenging[0]].filter(Boolean));
  const summary = [...new Set([...strongest, ...representatives.values()])].slice(0, Math.max(4, strongest.length));
  return { status, reason, findings, summary, targets, records, independentCount: records.length, weightedCount: weighted.size, conflictingRecords };
}

async function verifyBatch(snapshot: Snapshot, pages: Page[], request: EvidenceRequest, signal: AbortSignal) {
  snapshot.calls++;
  const result = await request("assess-evidence", {
    version: VERIFICATION_VERSION, action: "verify_passages", claim: snapshot.claim,
    plan: { ...snapshot.plan, ok: true, version: VERIFICATION_VERSION },
    sources: pages.map(page => ({
      url: page.url, title: page.title, text: page.passage.text, publishedDate: page.date, author: page.author, links: page.links,
      ...(page.paper ? { paper: page.paper, textType: page.passage.scope } : {}),
    })),
  }, signal);
  signal.throwIfAborted();
  const data = object(result);
  if (data?.ok !== true || data.version !== VERIFICATION_VERSION || !Array.isArray(data.assessments)) {
    throw new Error("Assessment returned an incomplete or invalid batch.");
  }
  const assessments: Assessment[] = [];
  const rejected: unknown[] = [];
  // Older assessors identify an abstract as a web excerpt. Recognize the
  // mismatch for diagnostics only. Never remap a finding to the current source.
  const legacyAbstracts = new Map(data.paperAware === true ? [] : pages.flatMap(page => {
    if (page.passage.scope !== "abstract") return [];
    const id = canonicalPageUrl(page.url);
    return id ? [[id, page] as const] : [];
  }));
  const unchecked = new Map(pages.map(page => [page.id, page]));
  const findPage = (id: unknown) => typeof id === "string" ? unchecked.get(id) ?? legacyAbstracts.get(id) : undefined;
  const unassessed = data.unassessedIds === undefined ? [] : data.unassessedIds;
  if (!Array.isArray(unassessed) || !unassessed.every(id => {
    const page = findPage(id);
    return page !== undefined && unchecked.delete(page.id);
  })) {
    throw new Error("The assessment did not identify which pages were verified.");
  }
  if (data.assessments.length !== unchecked.size || !unchecked.size) {
    throw new Error("Assessment returned an incomplete or invalid batch.");
  }
  for (const entry of data.assessments) {
    const id = object(entry)?.id;
    const page = findPage(id);
    if (!page || !unchecked.delete(page.id)) throw new Error("Assessment returned a duplicate or unknown page.");
    if (page.passage.scope === "abstract" && data.paperAware !== true) {
      snapshot.paperAssessmentNeedsUpdate = true;
      rejected.push(new LegacyAbstractAssessmentError());
      continue;
    }
    try {
      assessments.push(...readAssessment({ ...data, assessments: [entry] }, [page], snapshot.plan.targets));
    } catch (error) {
      // Keep independently validated pages. A rejected page stays unassessed and can be retried.
      rejected.push(error);
    }
  }
  return { assessments, rejected };
}

function batchPages(pages: Page[], size: number) {
  const batches: Page[][] = [];
  for (let start = 0; start < pages.length; start += size) batches.push(pages.slice(start, start + size));
  return batches;
}

async function verify(snapshot: Snapshot, pages: Page[], request: EvidenceRequest, signal: AbortSignal, trace: Trace): Promise<Assessment[]> {
  const assessments: Assessment[] = [];
  const failures: unknown[] = [];
  const smallerBatches: Page[][] = [];
  snapshot.providerBackoff = false;
  let budgetReached = false;

  async function runBatches(batches: Page[][], canSplit: boolean) {
    for (let start = 0; start < batches.length; start += MAX_CONCURRENT_ASSESSMENTS) {
      signal.throwIfAborted();
      const remaining = MAX_ASSESSMENT_CALLS - snapshot.calls;
      budgetReached ||= remaining < batches.length - start;
      const wave = batches.slice(start, start + Math.min(remaining, MAX_CONCURRENT_ASSESSMENTS));
      if (!wave.length) break;
      const results = await Promise.allSettled(wave.map(batch => verifyBatch(snapshot, batch, request, signal)));
      signal.throwIfAborted();
      for (const [index, outcome] of results.entries()) {
        if (outcome.status === "fulfilled") {
          assessments.push(...outcome.value.assessments);
          failures.push(...outcome.value.rejected);
          continue;
        }
        failures.push(outcome.reason);
        if ([429, 503].includes(Number(object(outcome.reason)?.status))) snapshot.providerBackoff = true;
        const batch = wave[index];
        if (canSplit && batch.length > 1 && assessmentHitLimit(outcome.reason)) {
          smallerBatches.push(...batchPages(batch, Math.ceil(batch.length / 2)));
        }
      }
      if (snapshot.providerBackoff) break;
    }
  }

  await runBatches(batchPages(pages, ASSESSMENT_BATCH_SIZE), true);
  if (!snapshot.providerBackoff && smallerBatches.length && snapshot.calls < MAX_ASSESSMENT_CALLS) {
    trace({ title: "Retrying interrupted checks in smaller batches", notes: [], phase: "Reading excerpts" });
    await runBatches(smallerBatches, false);
  }
  if (failures.length || budgetReached) {
    trace({
      title: "Excerpt assessment details",
      notes: [
        `${assessments.length} of ${pages.length} selected excerpts checked.`,
        ...new Set(failures.map(sourceError)),
        ...(budgetReached ? ["The assessment request limit was reached."] : []),
      ],
    });
  }
  if (!assessments.length) {
    throw failures.find(error => error instanceof LegacyAbstractAssessmentError)
      ?? failures.at(-1) ?? new Error("The assessment limit for this investigation was reached.");
  }
  return assessments;
}

function complete(snapshot: Snapshot, assessments: Assessment[], caveats: string[]): Extract<Investigation, { state: "complete" }> {
  const review = reviewEvidence(snapshot, assessments);
  const coverage = [...caveats];
  const counter = snapshot.searches.filter(search => search.direction === "Counterevidence");
  const directChallenges = new Set(review.targets.flatMap(target => target.challenging.map(entry => entry.page.id)));
  if (snapshot.searches.some(search => search.state === "limited")) {
    coverage.unshift("Evidence Lab reached its search limit. The result uses the sources it found before that limit. Wait a few minutes before starting another investigation.");
  }
  const failedDirections = [...new Set(snapshot.searches.filter(search => search.state === "failed").map(search => search.direction))];
  if (failedDirections.length) {
    coverage.push(`Search failed for ${failedDirections.map(direction => direction.toLowerCase()).join(", ")}. See the activity log for the affected queries.`);
  }
  if (!counter.some(search => search.pageIds.some(id => directChallenges.has(id)))) {
    coverage.push("Counterevidence searches yielded no retained, independently verified challenge. This search cannot establish consensus.");
  }
  if (snapshot.searches.some(search => search.state === "empty")) {
    coverage.push("At least one search direction returned no usable pages.");
  }
  if (snapshot.selected.some(page => !assessments.some(entry => entry.id === page.id))) {
    coverage.push("Some excerpts could not be checked. Their sources are still available below.");
  } else if (snapshot.pages.some(page => page.passage.scope !== "metadata only" && !assessments.some(entry => entry.id === page.id))) {
    coverage.push("Some retrieved pages remain unassessed and did not contribute to the result.");
  }
  if (review.findings.some(item => !item.recordId)) {
    coverage.push("Pages without a verified original record did not count as independent evidence.");
  }
  return { state: "complete", snapshot, assessments, review, caveats: coverage };
}

type Trace = (step: TraceStep) => void;
function searchStep(title: string, searches: SearchLog[]): TraceStep {
  return {
    title,
    notes: searches.map(search => {
      const outcome = search.state === "limited" ? "search limit reached"
        : search.state === "skipped" ? "skipped after the search limit was reached"
        : search.state === "failed" ? `failed (${search.error})`
        : search.state === "empty" ? "no results"
        : `${search.pageIds.length} distinct ${search.provider === "openalex" ? "papers" : "pages"}`;
      const provider = search.provider === "openalex" ? " (OpenAlex)" : search.provider === "tavily" ? " (Tavily)" : " (Exa)";
      const retrievedText = search.textCount === undefined ? "" : `; ${search.textCount} with abstract text`;
      return `${search.direction}${provider}: ${search.text} · ${outcome}${retrievedText}`;
    }),
  };
}

export async function runInvestigation(claim: string, request: EvidenceRequest, signal: AbortSignal, trace: Trace, mode: "claim" | "motion" = "claim"): Promise<Investigation> {
  const snapshot: Snapshot = { claim, plan: fallbackPlan(claim), pages: [], selected: [], searches: [], calls: 1, researchMode: mode };
  const seen = new Set<string>();
  let searchLimitReached = false;
  const search = async (query: Query) => {
    try {
      const response = await request("exa-search", {
        version: VERIFICATION_VERSION, query: query.text,
        ...(query.provider ? { provider: query.provider } : {}),
      }, signal);
      signal.throwIfAborted();
      const provider = object(response)?.provider;
      if (query.provider === "openalex" && provider !== "openalex") {
        throw new Error("The search function does not support OpenAlex yet.");
      }
      const pages = mergePages(readSearchPages(response), claim);
      const log: SearchLog = {
        ...query, provider: provider === "tavily" || provider === "openalex" ? provider : "exa",
        state: pages.length ? "retrieved" : "empty", pageIds: pages.map(page => page.id),
        ...(provider === "openalex" && pages.length ? { textCount: pages.filter(page => page.passage.scope === "abstract").length } : {}),
      };
      return { log, pages };
    } catch (error) {
      signal.throwIfAborted();
      const limited = object(error)?.status === 429;
      if (limited) searchLimitReached = true;
      const log: SearchLog = { ...query, state: limited ? "limited" : "failed", pageIds: [], error: sourceError(error) };
      return { log, pages: [] };
    }
  };
  async function collect(queries: Query[]) {
    const pending = queries.flatMap(query => {
      const text = query.text.trim().slice(0, 560);
      const key = `${query.provider ?? "exa"}:${text.toLowerCase().replace(/\s+/g, " ")}`;
      if (!text || seen.has(key) || seen.size >= MAX_SEARCHES) return [];
      seen.add(key);
      if (searchLimitReached) {
        const log: SearchLog = { ...query, text, state: "skipped", pageIds: [] };
        return [Promise.resolve({ log, pages: [] })];
      }
      return [search({ ...query, text })];
    });
    const results = await Promise.all(pending);
    snapshot.searches.push(...results.map(result => result.log));
    snapshot.pages = mergePages([...snapshot.pages, ...results.flatMap(result => result.pages)], claim);
    return results.map(result => result.log);
  }

  trace({ title: "Searching for web sources and research papers", notes: [], phase: "Finding sources" });
  const [initial, planned] = await Promise.all([
    collect([{ direction: "Neutral", text: claim }, { direction: "Research papers", provider: "openalex", text: claim }]),
    request("assess-evidence", {
      version: VERIFICATION_VERSION, action: "plan_verification", claim, ...(mode === "motion" ? { researchMode: "motion" } : {}),
    }, signal).then(response => ({ response, error: "", cause: null }), error => ({ response: null, error: sourceError(error), cause: error })),
  ]);
  signal.throwIfAborted();
  snapshot.plan = readPlan(planned.response, claim);
  trace(searchStep("Web and scholarly search", initial));
  if (planned.error || snapshot.plan.targets.every(target => !target.outcome)) {
    trace({
      title: "Research planning unavailable",
      notes: [planned.error ?? "The planner returned no usable research questions. General source searches are still available."],
      phase: "Finding sources",
    });
  }
  if ([429, 503].includes(Number(object(planned.cause)?.status))) {
    snapshot.providerBackoff = true;
    snapshot.planningNeedsRetry = true;
    snapshot.selected = selectPages(snapshot.pages, snapshot.plan, claim);
    trace({ title: "Paused while the AI provider is unavailable", notes: ["Retrieved sources were kept. No further automatic AI requests were made."], phase: "Reading excerpts" });
    return { state: "unavailable", snapshot, reason: assessmentError(planned.cause) };
  }
  const questions = mode === "motion" ? snapshot.plan.targets.filter(target => target.outcome && target.text !== claim).slice(0, 2) : [];
  const broadQueries: Query[] = questions.map(({ text }) => ({ direction: "Research question", text: `Original research, findings, and contrary results: ${text}` }));
  const fallbackQueries: Query[] = [
    { direction: "Counterevidence", text: snapshot.plan.counterQuery },
    { direction: "Primary records", text: snapshot.plan.primaryQuery },
  ];
  const broadTitle = questions.length ? "Researching factual questions" : "Looking for counterevidence and primary records";
  trace({ title: broadTitle, notes: [], phase: "Finding sources" });
  const broad = await collect([...broadQueries, ...fallbackQueries].slice(0, 2));
  trace(searchStep(broadTitle, broad));
  const namedIndianLaw = /\b(?:india|indian)\b/i.test(claim)
    && /\b(?:article|section)\s+\d+/i.test(claim);
  const webPages = snapshot.pages.filter(page => page.passage.scope === "retrieved excerpt");
  if (namedIndianLaw && webPages.length && !webPages.some(page => isOfficialIndianLawPage(page) && page.passage.text)) {
    const primary = await collect([{ direction: "Primary records", provider: "tavily", text: snapshot.plan.primaryQuery }]);
    trace(searchStep("Checking official legal sources", primary));
  }
  if (!webPages.some(page => page.passage.text.trim()) && seen.size < MAX_SEARCHES) {
    const recovered = await collect([{
      direction: "Recovery", provider: "tavily",
      text: `Original records and evidence, including null results and exceptions: ${claim}`,
    }]);
    trace(searchStep("Recovery search", recovered));
  }
  snapshot.selected = selectPages(snapshot.pages, snapshot.plan, claim);
  if (!snapshot.selected.length && snapshot.pages.some(page => page.passage.scope === "metadata only")) {
    const result = complete(snapshot, [], []);
    trace(finalStep(result));
    return result;
  }
  if (!snapshot.selected.length) {
    const failed = snapshot.searches.filter(log => log.state === "failed");
    const webSearchFinished = snapshot.searches.some(log => log.provider !== "openalex" && (log.state === "empty" || log.state === "retrieved"));
    const onlyPaperSearchFailed = failed.length > 0 && failed.every(log => log.provider === "openalex");
    const successful = (!failed.length && snapshot.searches.some(log => log.state === "empty"))
      || (onlyPaperSearchFailed && webSearchFinished);
    return {
      state: successful && !searchLimitReached ? "empty" : "search-failed", snapshot,
      reason: searchLimitReached ? searchLimitMessage
        : snapshot.pages.length ? "The search found source records, but none included text that could be assessed."
        : successful ? "The completed searches returned no usable pages."
        : failed[0]?.error || "The search service did not respond.",
    };
  }

  trace({ title: "Assessing retrieved excerpts", notes: [`${snapshot.selected.length} pages selected from ${snapshot.pages.length} distinct pages.`], phase: "Reading excerpts" });
  let assessments: Assessment[];
  try {
    assessments = await verify(snapshot, snapshot.selected, request, signal, trace);
  } catch (error) {
    signal.throwIfAborted();
    return { state: "unavailable", snapshot, reason: assessmentError(error) };
  }
  if (snapshot.providerBackoff) return complete(snapshot, assessments, ["Some excerpts could not be assessed because the AI provider is busy or rate limited. Wait before retrying the unchecked excerpts."]);
  const previous = reviewEvidence(snapshot, assessments);
  const gap = previous.targets.find(target => target.status === "insufficient");
  const noChallenge = !previous.targets.some(target => target.challenging.length > 0);
  const optional: Query[] = [];
  const triedTavily = snapshot.searches.some(search => search.provider === "tavily");
  if (gap) {
    optional.push({
      direction: "Missing proposition",
      text: `Direct primary evidence or null results: ${gap.target.text}`,
      provider: !triedTavily ? "tavily" : "exa",
    });
  }
  if (noChallenge) {
    optional.push({ direction: "Counterevidence", text: `Original studies or records reporting null results, exceptions, or contrary outcomes: ${claim}` });
  }
  const caveats: string[] = [];
  if (optional.length && seen.size < MAX_SEARCHES) {
    trace({ title: "Checking gaps in the initial evidence", notes: [], phase: "Finding sources" });
    const followup = await collect(optional);
    trace(searchStep("Targeted verification searches", followup));
    const selected = selectPages(snapshot.pages, snapshot.plan, claim, MAX_EVIDENCE_PAGES, previous.findings);
    const signature = (page: Page) => JSON.stringify([page.passage.id, page.url, page.links]);
    const previousIds = new Set(snapshot.selected.map(signature));
    const toAssess = selected.filter(page => !previousIds.has(signature(page)));
    if (toAssess.length) {
      trace({ title: "Verifying additional source passages", notes: [`${toAssess.length} new or previously unverified pages selected for assessment.`], phase: "Reading excerpts" });
      try {
        const updated = await verify(snapshot, toAssess, request, signal, trace);
        const refreshed = new Set(updated.map(entry => entry.id));
        const earlierPages = new Map(snapshot.selected.map(page => [page.id, page]));
        const earlier = assessments.filter(entry => !refreshed.has(entry.id) && selected.some(page => page.id === entry.id));
        const preserved = new Set(earlier.map(entry => entry.id));
        snapshot.selected = selected.map(page => preserved.has(page.id) ? earlierPages.get(page.id)! : page);
        snapshot.pages = snapshot.pages.map(page => preserved.has(page.id) ? earlierPages.get(page.id)! : page);
        assessments = [...updated, ...earlier];
      } catch (error) {
        signal.throwIfAborted();
        caveats.push("Follow-up assessment was unavailable. The previous validated evidence was kept.");
        // Keep the exact earlier excerpt where a later search returned a different snapshot of the same page.
        const reviewed = new Map(snapshot.selected.map(page => [page.id, page]));
        snapshot.pages = snapshot.pages.map(page => reviewed.get(page.id) ?? page);
      }
    } else if (followup.some(log => log.state === "retrieved")) {
      caveats.push("Targeted searches returned no stronger distinct pages within the assessment limit.");
    }
  }
  const result = complete(snapshot, assessments, caveats);
  trace(finalStep(result));
  return result;
}

function finalStep(result: Extract<Investigation, { state: "complete" }>): TraceStep {
  const { snapshot, review, assessments } = result;
  const weightedPages = new Set(review.targets.flatMap(target =>
    [...target.supporting, ...target.challenging].map(entry => entry.page.id)
  ));
  return {
    title: "Comparing validated findings",
    notes: [
      `${snapshot.pages.length} distinct sources retrieved; ${assessments.length} assessed; ${review.independentCount} independent records identified; ${review.weightedCount} contributed to a checked proposition.`,
      ...snapshot.searches.filter(search => search.state === "retrieved" && !search.pageIds.some(id => weightedPages.has(id)))
        .map(search => `No retained direct independent finding from ${search.direction.toLowerCase()}: ${search.text}`),
    ],
  };
}

export function canRetryAssessment(result: Investigation) {
  if (result.snapshot.calls >= MAX_ASSESSMENT_CALLS || !result.snapshot.selected.length) return false;
  if (result.state === "unavailable") return true;
  return result.state === "complete"
    && result.snapshot.selected.some(page => !result.assessments.some(entry => entry.id === page.id));
}

export async function retryAssessment(previous: AssessmentResult, request: EvidenceRequest, signal: AbortSignal, trace: Trace): Promise<Investigation> {
  const snapshot = { ...previous.snapshot };
  const earlier = previous.state === "complete" ? previous.assessments : [];
  if (!canRetryAssessment(previous)) return previous;
  try {
    if (snapshot.planningNeedsRetry) {
      trace({ title: "Retrying research planning with saved sources", notes: [], phase: "Reading excerpts" });
      snapshot.calls++;
      const response = await request("assess-evidence", { version: VERIFICATION_VERSION, action: "plan_verification", claim: snapshot.claim,
        ...(snapshot.researchMode === "motion" ? { researchMode: "motion" } : {}),
      }, signal);
      signal.throwIfAborted();
      const planned = readPlan(response, snapshot.claim);
      if (!planned.targets.some(target => target.outcome)) throw new Error("Research planning returned no usable questions. Your sources remain available.");
      snapshot.plan = planned;
      snapshot.planningNeedsRetry = false;
      snapshot.providerBackoff = false;
      snapshot.selected = selectPages(snapshot.pages, snapshot.plan, snapshot.claim);
    }
    const pending = snapshot.selected.filter(page => !earlier.some(entry => entry.id === page.id));
    if (!pending.length) return previous;
    trace({ title: "Retrying assessment of the saved excerpts", notes: [], phase: "Reading excerpts" });
    const assessments = [...earlier, ...await verify(snapshot, pending, request, signal, trace)];
    const result = complete(snapshot, assessments, []);
    trace(finalStep(result));
    return result;
  } catch (error) {
    signal.throwIfAborted();
    if (previous.state === "complete") return { ...previous, snapshot };
    return { state: "unavailable", snapshot, reason: assessmentError(error) };
  }
}

export function createInvestigationRun() {
  let active: { controller: AbortController; type: "search" | "retry" } | null = null;
  return {
    begin(type: "search" | "retry") {
      if (active && (active.type === "search" || type === "retry")) return null;
      active?.controller.abort();
      const controller = new AbortController();
      active = { controller, type };
      return controller;
    },
    current(controller: AbortController) { return active?.controller === controller && !controller.signal.aborted; },
    finish(controller: AbortController) { if (active?.controller === controller) active = null; },
    cancel() { active?.controller.abort(); active = null; },
  };
}
