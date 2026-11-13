import {
  fallbackPlan,
  MAX_EVIDENCE_PAGES,
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

export type EvidenceRequest = (
  name: "assess-evidence" | "exa-search", body: Record<string, unknown>, signal?: AbortSignal,
) => Promise<unknown>;
export type SearchDirection = "Neutral" | "Counterevidence" | "Primary records" | "Missing proposition" | "Recovery";
type Query = { direction: SearchDirection; text: string };
export type SearchLog = Query & {
  state: "failed" | "empty" | "retrieved";
  pageIds: string[];
  error?: string;
};
export type TraceStep = { title: string; notes: string[] };
export type Snapshot = { claim: string; plan: Plan; pages: Page[]; selected: Page[]; searches: SearchLog[]; calls: number };
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

const strengthWeight = { strong: 2, moderate: 1, weak: 0 };
const sourceError = (error: unknown) => error instanceof Error ? error.message : "The service did not respond.";

export function mergePages(pages: Page[], scope: string): Page[] {
  const unique = new Map<string, Page>();
  for (const page of pages) {
    const previous = unique.get(page.id);
    if (!previous || pagePriority(page, scope) > pagePriority(previous, scope)) unique.set(page.id, page);
    else if (previous.passage.id === page.passage.id) {
      unique.set(page.id, { ...previous, links: [...new Set([...previous.links, ...page.links])].slice(0, 30) });
    }
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
    + Number(Boolean(page.date)) + Math.min(page.passage.text.length, 800) / 800;
}

export function selectPages(pages: Page[], plan: Plan, claim: string, limit = MAX_EVIDENCE_PAGES, reviewed: CitedFinding[] = []): Page[] {
  const scope = [claim, ...plan.targets.map(target => target.text)].join(" ");
  const confirmed = new Set(reviewed.filter(entry =>
    entry.recordId && entry.finding.match === "direct" && entry.finding.strength !== "weak"
  ).map(entry => entry.page.passage.id));
  const pool = mergePages(pages, scope);
  const ranks = plan.targets.map(target => pool.map(page => ({
    page, score: pagePriority(page, target.text) + 4 * Number(confirmed.has(page.passage.id)),
  })).sort((a, b) => b.score - a.score));
  const selected = new Map<string, Page>();
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
    const status = supporting.length && challenging.length ? "mixed"
      : supporting.length >= 2 ? "supported" : challenging.length >= 2 ? "refuted" : "insufficient";
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
    : status === "supported" || status === "refuted" ? "At least two independent records directly address each checked proposition in the same direction."
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

async function verify(snapshot: Snapshot, request: EvidenceRequest, signal: AbortSignal): Promise<Assessment[]> {
  if (snapshot.calls >= MAX_ASSESSMENT_CALLS) throw new Error("The assessment limit for this investigation was reached.");
  snapshot.calls++;
  const result = await request("assess-evidence", {
    version: VERIFICATION_VERSION, action: "verify_passages", claim: snapshot.claim,
    plan: { ...snapshot.plan, ok: true, version: VERIFICATION_VERSION },
    sources: snapshot.selected.map(page => ({
      url: page.url, title: page.title, text: page.passage.text, publishedDate: page.date, author: page.author, links: page.links,
    })),
  }, signal);
  signal.throwIfAborted();
  return readAssessment(result, snapshot.selected, snapshot.plan.targets);
}

function complete(snapshot: Snapshot, assessments: Assessment[], caveats: string[]): Extract<Investigation, { state: "complete" }> {
  const review = reviewEvidence(snapshot, assessments);
  const coverage = [...caveats];
  const counter = snapshot.searches.filter(search => search.direction === "Counterevidence");
  const directChallenges = new Set(review.targets.flatMap(target => target.challenging.map(entry => entry.page.id)));
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
  if (snapshot.pages.some(page => !assessments.some(entry => entry.id === page.id))) {
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
      const outcome = search.state === "failed" ? `failed (${search.error})`
        : search.state === "empty" ? "no usable pages" : `${search.pageIds.length} distinct pages`;
      return `${search.direction}: ${search.text} · ${outcome}`;
    }),
  };
}

export async function runInvestigation(claim: string, request: EvidenceRequest, signal: AbortSignal, trace: Trace): Promise<Investigation> {
  const snapshot: Snapshot = { claim, plan: fallbackPlan(claim), pages: [], selected: [], searches: [], calls: 1 };
  const seen = new Set<string>();
  const search = async (query: Query) => {
    try {
      const response = await request("exa-search", { version: VERIFICATION_VERSION, query: query.text }, signal);
      signal.throwIfAborted();
      const pages = mergePages(readSearchPages(response), claim);
      const log: SearchLog = { ...query, state: pages.length ? "retrieved" : "empty", pageIds: pages.map(page => page.id) };
      return { log, pages };
    } catch (error) {
      signal.throwIfAborted();
      const log: SearchLog = { ...query, state: "failed", pageIds: [], error: sourceError(error) };
      return { log, pages: [] };
    }
  };
  async function collect(queries: Query[]) {
    const pending = queries.flatMap(query => {
      const text = query.text.trim().slice(0, 560);
      const key = text.toLowerCase().replace(/\s+/g, " ");
      if (!text || seen.has(key) || seen.size >= MAX_SEARCHES) return [];
      seen.add(key);
      return [search({ ...query, text })];
    });
    const results = await Promise.all(pending);
    snapshot.searches.push(...results.map(result => result.log));
    snapshot.pages = mergePages([...snapshot.pages, ...results.flatMap(result => result.pages)], claim);
    return results.map(result => result.log);
  }

  trace({ title: "Checking scope and starting a neutral search", notes: [] });
  const [initial, planned] = await Promise.all([
    collect([{ direction: "Neutral", text: claim }]),
    request("assess-evidence", {
      version: VERIFICATION_VERSION, action: "plan_verification", claim,
    }, signal).catch(() => null),
  ]);
  signal.throwIfAborted();
  snapshot.plan = readPlan(planned, claim);
  trace(searchStep("Neutral search", initial));
  trace({ title: "Looking for counterevidence and primary records", notes: [] });
  const broad = await collect([
    { direction: "Counterevidence", text: snapshot.plan.counterQuery },
    { direction: "Primary records", text: snapshot.plan.primaryQuery },
  ]);
  trace(searchStep("Counterevidence and primary records", broad));
  if (!snapshot.pages.length && snapshot.searches.some(log => log.state !== "failed")) {
    const recovered = await collect([{
      direction: "Recovery", text: `Original records and evidence, including null results and exceptions: ${claim}`,
    }]);
    trace(searchStep("Recovery search", recovered));
  }
  if (!snapshot.pages.length) {
    const successful = snapshot.searches.some(log => log.state !== "failed");
    return {
      state: successful ? "empty" : "search-failed", snapshot,
      reason: successful ? "The completed searches returned no usable pages." : snapshot.searches[0]?.error || "The search service did not respond.",
    };
  }

  snapshot.selected = selectPages(snapshot.pages, snapshot.plan, claim);
  trace({ title: "Assessing retrieved excerpts", notes: [`${snapshot.selected.length} pages selected from ${snapshot.pages.length} distinct pages.`] });
  let assessments: Assessment[];
  try {
    assessments = await verify(snapshot, request, signal);
  } catch (error) {
    signal.throwIfAborted();
    return { state: "unavailable", snapshot, reason: sourceError(error) };
  }
  const previous = reviewEvidence(snapshot, assessments);
  const gap = previous.targets.find(target => target.status === "insufficient");
  const noChallenge = !previous.targets.some(target => target.challenging.length > 0);
  const optional: Query[] = [];
  if (gap) {
    optional.push({ direction: "Missing proposition", text: `Direct primary evidence or null results: ${gap.target.text}` });
  }
  if (noChallenge) {
    optional.push({ direction: "Counterevidence", text: `Original studies or records reporting null results, exceptions, or contrary outcomes: ${claim}` });
  }
  const caveats: string[] = [];
  if (optional.length && seen.size < MAX_SEARCHES) {
    trace({ title: "Checking gaps in the initial evidence", notes: [] });
    const followup = await collect(optional);
    trace(searchStep("Targeted verification searches", followup));
    const selected = selectPages(snapshot.pages, snapshot.plan, claim, MAX_EVIDENCE_PAGES, previous.findings);
    const signature = (page: Page) => JSON.stringify([page.passage.id, page.links]);
    const previousIds = new Set(snapshot.selected.map(signature));
    if (selected.some(page => !previousIds.has(signature(page)))) {
      const next = { ...snapshot, selected };
      trace({ title: "Verifying the updated evidence set", notes: [`${selected.length} pages selected for assessment.`] });
      try {
        assessments = await verify(next, request, signal);
        snapshot.selected = selected;
      } catch (error) {
        signal.throwIfAborted();
        caveats.push(`Follow-up assessment was unavailable. The previous validated evidence was kept. ${sourceError(error)}`);
        // Keep the exact earlier excerpt where a later search returned a different snapshot of the same page.
        const reviewed = new Map(snapshot.selected.map(page => [page.id, page]));
        snapshot.pages = snapshot.pages.map(page => reviewed.get(page.id) ?? page);
      }
      snapshot.calls = next.calls;
    } else if (followup.some(log => log.state === "retrieved")) {
      caveats.push("Targeted searches returned no stronger distinct pages within the assessment limit.");
    }
  }
  const result = complete(snapshot, assessments, caveats);
  trace(finalStep(result));
  return result;
}

function finalStep(result: Extract<Investigation, { state: "complete" }>): TraceStep {
  const { snapshot, review } = result;
  const weightedPages = new Set(review.targets.flatMap(target =>
    [...target.supporting, ...target.challenging].map(entry => entry.page.id)
  ));
  return {
    title: "Comparing validated findings",
    notes: [
      `${snapshot.pages.length} distinct pages retrieved; ${snapshot.selected.length} assessed; ${review.independentCount} independent records identified; ${review.weightedCount} contributed to a checked proposition.`,
      ...snapshot.searches.filter(search => search.state === "retrieved" && !search.pageIds.some(id => weightedPages.has(id)))
        .map(search => `No retained direct independent finding from ${search.direction.toLowerCase()}: ${search.text}`),
    ],
  };
}

export async function retryAssessment(previous: Extract<Investigation, { state: "unavailable" }>, request: EvidenceRequest, signal: AbortSignal, trace: Trace): Promise<Investigation> {
  const snapshot = { ...previous.snapshot };
  trace({ title: "Retrying assessment of the saved excerpts", notes: [] });
  try {
    const assessments = await verify(snapshot, request, signal);
    const result = complete(snapshot, assessments, []);
    trace(finalStep(result));
    return result;
  } catch (error) {
    signal.throwIfAborted();
    return { state: "unavailable", snapshot, reason: sourceError(error) };
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
