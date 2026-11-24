import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { referenceCases, synthetic } from "./evidence-evaluation.mjs";

function transpile(url) {
  return {
    format: "module",
    shortCircuit: true,
    source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText,
  };
}
const hooks = registerHooks({
  load: (url, context, nextLoad) => url.endsWith(".tsx") ? transpile(url) : nextLoad(url, context),
});
const { default: EvidenceResults } = await import("../src/features/EvidenceResults.tsx");
hooks.deregister();
const {
  canonicalPageUrl, readAssessment, readPlan, readSearchPages, VERIFICATION_VERSION: version,
} = await import("../../app/supabase/functions/_shared/evidence-verification.ts");
const { handleVerification } = await import("../../app/supabase/functions/assess-evidence/verification.ts");
const { assessEvidencePractice } = await import("../../app/supabase/functions/ai-debate/evidence-practice.ts");
const { buildEvidenceCard, compareArgumentWording, readEvidenceCards, saveEvidenceCards, suggestEvidenceQuote } = await import("../src/lib/evidence-cards.ts");
const {
  canRetryAssessment, createInvestigationRun, MAX_ASSESSMENT_CALLS, mergePages, retryAssessment, reviewEvidence, runInvestigation,
} = await import("../src/lib/evidence-investigation.ts");

const { claim, outcome, positive, positive2, negative, proxy, observational } = synthetic;
const makeHit = (id, text = positive) => ({
  url: `https://doi.org/10.1234/${id}`,
  title: "Urban trees and heat-related illness",
  text,
  publishedDate: "2024-04-10",
});
const plan = (text = claim, checked = outcome, overrides = {}) => ({
  ok: true, version, complete: true, policy: false, counterQuery: "counter evidence", primaryQuery: "primary records",
  targets: [{ text, outcome: checked, causal: /reduce/.test(text), qualifiers: text === claim ? [{ kind: "timeframe", text: "summer" }] : [] }],
  ...overrides,
});
const pageList = hits => readSearchPages({ ok: true, results: hits });
const makeFinding = (page, overrides = {}) => ({
  targetId: "q1", passageId: page.passage.id, quote: page.passage.text,
  interpretation: "The study reports fewer cases of heat-related illness.",
  stance: "supports", strength: "strong", match: "direct", limitation: "",
  record: { type: "study", relation: "primary", url: page.url, proof: page.passage.text, aliases: [] },
  ...overrides,
});
const batch = (pages, getFindings = page => [makeFinding(page)]) => ({
  ok: true, version, paperAware: true, assessments: pages.map(page => ({ id: page.id, findings: getFindings(page) })),
});
const safeHtml = result => renderToStaticMarkup(React.createElement(EvidenceResults, {
  result, retry() {}, retrying: false, canRetry: true,
}));
function scored(hits, options = {}) {
  const pages = pageList(hits);
  const checked = options.claim ?? claim;
  const checkedPlan = readPlan(options.plan ?? plan(), checked);
  const snapshot = { claim: checked, plan: checkedPlan, pages, selected: pages, searches: [], calls: 1 };
  const assessments = readAssessment(batch(pages, options.findings), pages, checkedPlan.targets);
  const review = reviewEvidence(snapshot, assessments);
  return { state: "complete", snapshot, assessments, review, caveats: options.caveats ?? [] };
}
const activeSignal = () => new AbortController().signal;

test("normalizes tracking and anchors while preserving route, query, and document version", () => {
  assert.equal(canonicalPageUrl("https://example.org/report?utm_source=x&version=2&fbclid=123#section"), "https://example.org/report?version=2");
  assert.equal(canonicalPageUrl("https://example.org/#/reports/4"), "https://example.org/#/reports/4");
  assert.equal(canonicalPageUrl("javascript:alert(1)"), null);
  assert.equal(canonicalPageUrl("https://some-user:password@example.org/"), null);
  const pages = pageList([
    { url: "https://example.org/report?version=2&utm_source=a#results", text: "A short quote" },
    { url: "https://example.org/report?fbclid=b&version=2", text: positive },
    { url: "https://example.org/report?version=3", text: negative },
  ]);
  const unique = mergePages(pages, claim);
  assert.equal(unique.length, 2);
  assert.equal(unique[0].id, pages[0].id);
  assert.equal(unique[0].url, pages[1].url);
  assert.equal(unique[0].passage.id, pages[1].passage.id);
});

test("four pages about one study contribute one vote; same-title studies remain distinct", () => {
  const original = makeHit("original");
  const mirrors = [1, 2, 3].map(index => ({
    url: `https://outlet${index}.example/article`,
    title: original.title,
    text: `${positive} The study was published as DOI 10.1234/original.`,
  }));
  const result = scored([original, ...mirrors], {
    findings: page => [makeFinding(page, page.id === original.url ? {} : {
      record: { type: "study", relation: "secondary", url: original.url, proof: "The study was published as DOI 10.1234/original." },
    })],
  });
  assert.equal(result.snapshot.pages.length, 4);
  assert.equal(result.review.independentCount, 1);
  assert.equal(result.review.weightedCount, 1);
  assert.equal(result.review.status, "insufficient");
  assert.equal(result.review.targets[0].supporting[0].page.url, original.url);
  const separate = scored([original, makeHit("another-trial", positive2)]);
  assert.equal(separate.review.independentCount, 2);
  assert.equal(separate.review.status, "supported");
});

test("only self-identifying metadata joins DOI and PMID, and an isolated DOI stays unverified", () => {
  const doi = makeHit("alias");
  const pmidUrl = "https://pubmed.ncbi.nlm.nih.gov/3212345/";
  const self = "This original report identifies its DOI 10.1234/alias and PMID: 3212345.";
  const pmid = { url: pmidUrl, title: doi.title, text: `${self} ${positive2}` };
  const unknown = { url: "https://outlet.example/comment", title: doi.title, text: `${positive} References: DOI 10.1234/alias.` };
  const result = scored([doi, pmid, unknown], {
    findings: page => [makeFinding(page, page.id === pmidUrl ? {
      record: { type: "study", relation: "primary", url: pmidUrl, proof: self, aliases: [doi.url] },
    } : page.id === unknown.url ? {
      quote: positive,
      record: { type: "study", relation: "secondary", url: doi.url, proof: "References: DOI 10.1234/alias." },
    } : {})],
  });
  assert.equal(result.review.independentCount, 1);
  assert.equal(result.review.findings.find(item => item.page.url === unknown.url).recordId, null);
  assert.match(safeHtml(result), /Independence unverified/);
  assert.match(safeHtml(result), /https:\/\/outlet\.example\/comment/);
});

test("reproduced passages on competing canonical URLs cannot establish independent votes", () => {
  const mirrored = scored([
    { url: "https://publisher.example/report", title: "Report", text: positive },
    { url: "https://mirror.example/report", title: "Republished report", text: positive },
  ]);
  assert.equal(mirrored.review.independentCount, 0);
  assert.equal(mirrored.review.status, "insufficient");
  assert.match(safeHtml(mirrored), /Independence unverified/);
});

test("rejects duplicate, unknown, fabricated, and structurally invalid assessments", () => {
  const pages = pageList([makeHit("a"), makeHit("b")]);
  const targets = readPlan(plan(), claim).targets;
  const valid = batch(pages);
  const [first, second] = valid.assessments;
  const cases = [
    [first],
    [first, first],
    [first, { ...second, id: "https://unknown.example/" }],
    [first, { ...second, findings: [{ ...second.findings[0], passageId: "wrong-passage" }] }],
    [first, { ...second, findings: [{ ...second.findings[0], quote: "A fabricated sentence about heat illness." }] }],
    [first, { ...second, findings: [{ ...second.findings[0], strength: "certain" }] }],
    [first, { ...second, findings: [{ ...second.findings[0], interpretation: "" }] }],
  ];
  for (const assessments of cases) assert.throws(() => readAssessment({ ...valid, assessments }, pages, targets));
  const original = "Our randomized controlled trial found that urban trees reduced heat-related\nillness during summer.";
  const exact = pageList([makeHit("whitespace", original)]);
  assert.equal(readAssessment(batch(exact, page => [makeFinding(page, { quote: positive })]), exact, targets)[0].findings[0].quote, original);
});

test("real quotes about a proxy or a correlation cannot determine a causal verdict", () => {
  const result = scored([makeHit("proxy", proxy), makeHit("correlation", observational)]);
  assert.equal(result.review.status, "insufficient");
  assert.equal(result.review.weightedCount, 0);
  const html = safeHtml(result);
  assert.match(html, /does not identify the requested outcome/);
  assert.match(html, /does not establish a design that can support the causal claim/);
  assert.doesNotMatch(html, /The study reports fewer cases/);
});

test("directions, conflicts within one record, and missing propositions render distinctly", () => {
  const a = makeHit("a");
  const b = makeHit("b", positive2);
  assert.match(safeHtml(scored([a, b])), /Supports the claim/);
  assert.match(safeHtml(scored([makeHit("na", negative), makeHit("nb", negative)], {
    findings: page => [makeFinding(page, { stance: "contradicts", interpretation: "The trial reported no reduction." })],
  })), /Challenges the claim/);
  const conflicting = scored([makeHit("a", `${positive}\n${negative}`)], {
    findings: page => [
      makeFinding(page, { quote: positive }),
      makeFinding(page, { quote: negative, stance: "contradicts", interpretation: "A separate result in this trial reported no reduction." }),
    ],
  });
  const conflictHtml = safeHtml(conflicting);
  assert.equal(conflicting.review.weightedCount, 1);
  assert.match(conflictHtml, /Supports the claim/);
  assert.match(conflictHtml, /Challenges the claim/);
  assert.match(conflictHtml, /Different findings within one record/);
  assert.doesNotMatch(conflictHtml, /No direct (?:supporting|challenging) finding/);
  const compound = "Urban trees reduce heat-related illness during summer and improve air quality.";
  const result = scored([a, b], {
    claim: compound,
    plan: plan(compound, outcome, { targets: [
      { text: claim, outcome },
      { text: "Urban trees improve air quality.", outcome: "air quality" },
    ] }),
  });
  assert.deepEqual(result.review.targets.map(target => target.status), ["supported", "insufficient"]);
  assert.match(safeHtml(result), /Limited direct evidence.*air quality/);
  assert.doesNotMatch(safeHtml(result), /Verdict from retrieved evidence|Insufficient evidence/);
});

test("policy questions review factual premises without issuing a policy verdict", () => {
  const policy = "Should schools ban phones?";
  const premise = "Phones distract students during lessons.";
  const result = scored([makeHit("a", "A randomized controlled trial measured distraction from phones during lessons.")], {
    claim: policy,
    plan: plan(policy, "distraction", { policy: true, targets: [{ text: premise, outcome: "distract" }] }),
    findings: page => [makeFinding(page, { interpretation: "The trial measured classroom distraction.", stance: "neutral" })],
  });
  const html = safeHtml(result);
  assert.match(html, /Source analysis/);
  assert.match(html, /factual premises and trade-offs/);
  assert.doesNotMatch(html, /Verdict from retrieved evidence/);
});

function scenario({ verify, search, trace = [] } = {}) {
  const calls = [];
  const request = async (name, body) => {
    calls.push({ name, body });
    if (name === "exa-search") {
      if (body.provider === "openalex") return { ok: true, provider: "openalex", results: [] };
      return { ok: true, results: search ? await search(body.query) : [makeHit("a"), makeHit("b", positive2)] };
    }
    if (body.action === "plan_verification") return plan();
    const pages = pageList(body.sources);
    return verify ? verify(pages, calls.filter(call => call.body.action === "verify_passages").length) : batch(pages);
  };
  return { calls, request, run: () => runInvestigation(claim, request, activeSignal(), step => trace.push(step)) };
}

for (const kind of ["timeout", "provider failure", "invalid response", "incomplete batch"]) {
  test(`${kind} keeps links and excerpts and withholds all verdict content; retry only reassesses`, async () => {
    const fixture = scenario({
      verify: (pages, count) => {
        if (count > 1) return batch(pages);
        if (kind === "timeout") throw new DOMException("Timed out", "TimeoutError");
        if (kind === "provider failure") throw new Error("Provider unavailable");
        if (kind === "invalid response") return { ok: true, version, assessments: {} };
        return batch(pages.slice(0, 1));
      },
    });
    const failed = await fixture.run();
    assert.equal(failed.state, "unavailable");
    const html = safeHtml(failed);
    assert.match(html, /Source analysis unavailable/);
    assert.match(html, /Unassessed/);
    assert.match(html, /Read excerpt/);
    assert.match(html, /href="https:\/\/doi\.org\/10\.1234\/a"/);
    assert.doesNotMatch(html, /confidence|data-stance|What the passages establish|Verdict from retrieved evidence/i);
    const prior = fixture.calls.at(-1).body;
    const count = fixture.calls.length;
    const retried = await retryAssessment(failed, fixture.request, activeSignal(), () => {});
    assert.equal(retried.review.status, "supported");
    assert.deepEqual(fixture.calls.slice(count), [{ name: "assess-evidence", body: prior }]);
    assert.equal(retried.snapshot.claim, claim);
  });
}

test("a stale retry cannot publish after a newer investigation starts", async () => {
  const failed = await scenario({ verify: () => ({ ok: false }) }).run();
  const guard = createInvestigationRun();
  const controller = guard.begin("retry");
  assert.equal(guard.begin("retry"), null);
  let release;
  const stale = retryAssessment(failed, async (_name, body) => new Promise(resolve => {
    release = () => resolve(batch(pageList(body.sources)));
  }), controller.signal, () => {});
  const next = guard.begin("search");
  assert.ok(next);
  assert.equal(guard.current(controller), false);
  release();
  await assert.rejects(stale, { name: "AbortError" });
  assert.equal(guard.current(next), true);
});

test("a stronger follow-up can enter a full batch; failed reassessment keeps the earlier result", async () => {
  const original = [makeHit("a"), makeHit("b", positive2)];
  const weak = Array.from({ length: 10 }, (_, index) => ({
    url: `https://local.example/article/${index}`,
    title: "Other topic", text: "A general discussion about the subject.",
  }));
  const added = makeHit("new-primary", negative);
  const lookup = query => {
    if (query === claim) return [...original, ...weak.slice(0, 2)];
    if (query === "counter evidence") return weak.slice(2, 6);
    if (query === "primary records") return weak.slice(6);
    return [added];
  };
  const classify = pages => batch(pages, page => page.url === added.url ? [
    makeFinding(page, { stance: "contradicts", interpretation: "The new trial reported no reduction." }),
  ] : original.some(hit => hit.url === page.url) ? [makeFinding(page)] : []);
  for (const shouldFail of [false, true]) {
    const trace = [];
    const fixture = scenario({
      trace, search: lookup, verify: pages => pages.some(page => page.url === added.url) && shouldFail ? { ok: false } : classify(pages),
    });
    const result = await fixture.run();
    const batches = fixture.calls.filter(call => call.body.action === "verify_passages");
    assert.deepEqual(batches.map(call => call.body.sources.length), [4, 4, 4, 1]);
    assert.ok(batches.at(-1).body.sources.some(page => page.url === added.url));
    assert.ok(trace.length <= 10);
    assert.ok(result.snapshot.searches.length <= 5);
    assert.equal(result.snapshot.pages.length, 13);
    if (shouldFail) {
      assert.equal(result.review.status, "supported");
      assert.equal(result.review.weightedCount, 2);
      assert.ok(!result.assessments.some(entry => entry.id === added.url));
      const html = safeHtml(result);
      assert.match(html, /Searches that returned no sources/);
      assert.match(html, /Follow-up assessment was unavailable/);
      assert.match(html, /Unassessed/);
    } else {
      assert.equal(result.review.status, "mixed");
      assert.equal(result.review.weightedCount, 3);
    }
  }
});

test("a Supabase 546 splits the affected batch and retries only its remaining excerpts", async () => {
  const hits = Array.from({ length: 11 }, (_, i) => makeHit(`resource-${i}`, positive + " ".repeat(i)));
  let failedBatch;
  let remaining;
  let retriedManually = false;
  const trace = [];
  const limit = () => Object.assign(new Error("Supabase function returned 546. Reference: fixture-ref"), { status: 546 });
  const fixture = scenario({
    trace, search: query => query === claim ? hits : [],
    verify: pages => {
      if (!retriedManually && pages.length === 4 && !failedBatch) {
        failedBatch = pages.map(page => page.id);
        throw limit();
      }
      if (!retriedManually && pages.length === 2 && pages[0].id === failedBatch[0]) {
        remaining = pages;
        throw limit();
      }
      return batch(pages, () => []);
    },
  });
  const partial = await fixture.run();
  assert.equal(partial.state, "complete");
  assert.equal(partial.assessments.length, 9);
  assert.equal(partial.snapshot.pages.length, 11);
  assert.equal(canRetryAssessment(partial), true);
  assert.match(safeHtml(partial), /Retry remaining excerpts/);
  assert.match(safeHtml(partial), /Unassessed/);
  assert.ok(trace.some(step => step.notes.some(note => note.includes("fixture-ref"))));

  const previousCalls = fixture.calls.length;
  retriedManually = true;
  const result = await retryAssessment(partial, fixture.request, activeSignal(), () => {});
  assert.equal(result.assessments.length, 11);
  assert.equal(canRetryAssessment(result), false);
  const retries = fixture.calls.slice(previousCalls);
  assert.equal(retries.length, 1);
  assert.equal(retries[0].body.action, "verify_passages");
  assert.deepEqual(retries[0].body.sources.map(({ url, text }) => [url, text]),
    remaining.map(page => [page.url, page.passage.text]));
});

test("a repeated resource limit keeps the request budget and all retrieved sources", async () => {
  const hits = Array.from({ length: 12 }, (_, i) => makeHit(`resource-${i}`));
  const fixture = scenario({
    search: query => query === claim ? hits : [],
    verify() { throw Object.assign(new Error("Supabase function returned 546."), { status: 546 }); },
  });
  const result = await fixture.run();
  assert.equal(result.state, "unavailable");
  assert.equal(result.snapshot.pages.length, 12);
  assert.equal(result.snapshot.calls, MAX_ASSESSMENT_CALLS);
  assert.equal(fixture.calls.filter(call => call.name === "assess-evidence").length, MAX_ASSESSMENT_CALLS);
  assert.equal(canRetryAssessment(result), false);
  assert.match(result.reason, /stopped before it could finish/);
  assert.match(safeHtml(result), /Read excerpt/);
});

test("a malformed finding leaves its page unassessed while validated pages from the same batch remain", async () => {
  const good = makeHit("kept");
  const bad = makeHit("retry");
  const trace = [];
  let retrying = false;
  const fixture = scenario({
    trace, search: query => query === claim ? [good, bad] : [],
    verify: pages => batch(pages, page => [makeFinding(page, page.url === bad.url && !retrying ? {
      passageId: "incorrect-passage", interpretation: "REJECTED FINDING",
    } : {})]),
  });
  const partial = await fixture.run();
  assert.equal(partial.state, "complete");
  assert.deepEqual(partial.assessments.map(entry => entry.id), [good.url]);
  assert.match(safeHtml(partial), /Retry remaining excerpts/);
  assert.doesNotMatch(safeHtml(partial), /REJECTED FINDING|malformed finding/);
  assert.ok(trace.some(step => step.notes.includes("Assessment returned a malformed finding.")));

  const calls = fixture.calls.length;
  retrying = true;
  const completed = await retryAssessment(partial, fixture.request, activeSignal(), () => {});
  assert.equal(completed.assessments.length, 2);
  assert.equal(canRetryAssessment(completed), false);
  assert.deepEqual(fixture.calls.slice(calls).flatMap(call => call.body.sources.map(page => page.url)), [bad.url]);
});

test("a gap in verified records triggers Tavily while the first searches use Exa", async () => {
  const original = makeHit("original");
  const extra = makeHit("recovery", positive2);
  const calls = [];
  const trace = [];
  const result = await runInvestigation(claim, async (name, body) => {
    calls.push({ name, body });
    if (name === "exa-search") {
      return body.provider === "tavily"
        ? { ok: true, provider: "tavily", results: [extra] }
        : { ok: true, provider: "exa", results: [original] };
    }
    if (body.action === "plan_verification") return plan();
    return batch(pageList(body.sources));
  }, activeSignal(), step => trace.push(step));
  const searches = calls.filter(call => call.name === "exa-search");
  assert.ok(searches.slice(0, 3).every(({ body }) => body.provider !== "tavily"));
  assert.equal(searches.filter(({ body }) => body.provider === "tavily").length, 1);
  assert.equal(result.review.status, "supported");
  assert.equal(result.review.weightedCount, 2);
  assert.ok(trace.some(step => step.notes.some(note => note.includes("Missing proposition (Tavily)"))));
});

test("a search limit keeps existing evidence and skips further provider requests", async () => {
  const calls = [];
  const trace = [];
  const request = async (name, body) => {
    if (name === "exa-search") {
      calls.push(body);
      if (body.query === claim) return { ok: true, results: [makeHit("before-limit")] };
      throw Object.assign(new Error("Too many requests."), { status: 429 });
    }
    if (body.action === "plan_verification") return plan();
    return batch(pageList(body.sources));
  };
  const result = await runInvestigation(claim, request, activeSignal(), step => trace.push(step));
  assert.equal(result.state, "complete");
  assert.equal(result.snapshot.pages.length, 1);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(body => body.provider !== "tavily"));
  assert.match(result.caveats[0], /search limit.*sources it found before/);
  assert.ok(trace.some(step => step.notes.some(note => note.includes("skipped after the search limit"))));
});

test("a search limit on the first request is reported separately from empty results", async () => {
  let searches = 0;
  const result = await runInvestigation(claim, async (name, body) => {
    if (name === "assess-evidence" && body.action === "plan_verification") return plan();
    searches++;
    throw Object.assign(new Error("Too many requests."), { status: 429 });
  }, activeSignal(), () => {});
  assert.equal(searches, 2);
  assert.equal(result.state, "search-failed");
  assert.match(result.reason, /search limit.*Wait a few minutes/);
});

test("search failure, empty search and a failed direction remain distinguishable", async () => {
  assert.equal((await scenario({ search() { throw new Error("Search failed"); } }).run()).state, "search-failed");
  assert.equal((await scenario({ search: () => [] }).run()).state, "empty");
  const trace = [];
  const result = await scenario({
    trace, search(query) {
      if (query === "counter evidence") throw new Error("counter timed out");
      return query === claim ? [makeHit("a"), makeHit("b", positive2)] : [];
    },
  }).run();
  assert.equal(result.review.status, "supported");
  assert.match(safeHtml(result), /cannot establish consensus/);
  assert.match(safeHtml(result), /Web searches unavailable.*Counterevidence/);
  assert.match(safeHtml(result), /Searches that returned no sources.*Research papers/);
  assert.match(trace.flatMap(step => step.notes).join(" "), /counter evidence · failed \(counter timed out\)/);
  assert.doesNotMatch(trace.flatMap(step => step.notes).join(" "), /confidence|\d+%/i);
});

test("the OpenAlex limit leaves web results usable and distinguishes an empty web search", async () => {
  for (const hits of [[makeHit("web-source")], []]) {
    const calls = [];
    const trace = [];
    const result = await runInvestigation(claim, async (name, body) => {
      if (name === "exa-search") {
        calls.push(body);
        if (body.provider === "openalex") {
          // The Edge Function translates a provider 429 to 502. Only a Veritas 429 stops the investigation.
          throw Object.assign(new Error("OpenAlex reached its own request limit. Reference: test-reference"), { status: 502 });
        }
        return { ok: true, provider: body.provider ?? "exa", results: body.query === claim ? hits : [] };
      }
      if (body.action === "plan_verification") return plan();
      return batch(pageList(body.sources));
    }, activeSignal(), step => trace.push(step));

    assert.equal(calls.length, 5);
    assert.equal(calls.filter(call => call.provider === "openalex").length, 1);
    assert.equal(result.state, hits.length ? "complete" : "empty");
    const html = safeHtml(result);
    assert.match(html, /Research paper search unavailable/);
    assert.doesNotMatch(html, /Search interrupted|Evidence search failed|test-reference/);
    assert.ok(trace.some(step => step.notes.some(note => note.includes("Research papers (OpenAlex)") && note.includes("test-reference"))));
    if (hits.length) assert.match(html, /You can still read and use the web sources below\./);
    else assert.match(html, /No sources found/);
  }
});

const evidenceTopic = { motion: "Cities should plant more urban trees.", side: "for", claim };
const abstractQuote = "Greater tree cover was associated with fewer heat-related hospital visits in the surveyed districts.";
const paperHit = {
  url: "https://doi.org/10.1234/trees", title: "Trees and health", text: abstractQuote, textType: "abstract",
  paper: { provider: "openalex", workId: "W12345", doi: "https://doi.org/10.1234/trees", title: "Trees and health", authors: ["Example Author"], year: 2024 },
};
const cardNotes = { quote: abstractQuote, interpretation: "The study found an association.", limitation: "The study does not establish causation." };

test("an older assessor cannot attach web findings to OpenAlex abstracts or discard valid web results", async () => {
  const webHit = makeHit("valid-web");
  for (const inputPaper of [paperHit, { ...paperHit, url: "https://journal.example/tree-study", paper: { ...paperHit.paper, doi: null } }]) {
    const [currentPaper] = pageList([inputPaper]);
    const [legacyPaper] = pageList([{ ...inputPaper, paper: undefined }]);
    const trace = [];
    const result = await runInvestigation(claim, async (name, body) => {
      if (name === "exa-search") {
        return { ok: true, provider: body.provider ?? "exa",
          results: body.provider === "openalex" ? [inputPaper] : [webHit] };
      }
      if (body.action === "plan_verification") return plan();
      const response = batch(pageList(body.sources.map(source => ({ ...source, paper: undefined }))), page =>
        page.id === legacyPaper.id ? [] : [makeFinding(page)]
      );
      const staleAbstract = response.assessments.find(entry => entry.id === legacyPaper.id);
      staleAbstract.articleSummary = { text: "OLD ABSTRACT SUMMARY", quote: abstractQuote };
      return { ...response, paperAware: undefined };
    }, activeSignal(), step => trace.push(step));
    assert.equal(result.state, "complete");
    assert.ok(result.snapshot.pages.some(page => page.id === currentPaper.id && page.passage.scope === "abstract"));
    assert.deepEqual(result.assessments.map(entry => entry.id), [webHit.url]);
    const html = safeHtml(result);
    assert.doesNotMatch(html, /OLD ABSTRACT SUMMARY/);
    assert.match(html, /Unassessed/);
    assert.match(html, /needs an update to check research abstracts/);
    assert.ok(trace.some(step => step.notes.some(note => note.includes("assessment service needs an update"))));
  }
});

test("the paper-aware assessor returns the current passage identity after checking an abstract", async () => {
  const [paper] = pageList([paperHit]);
  const response = await handleVerification({
    version, action: "verify_passages", claim, plan: plan(), sources: [paperHit],
  }, async prompt => {
    if (prompt.startsWith("Verify proposed")) {
      return JSON.stringify({ checks: [{ key: "0:0", decision: "keep", recordConfirmed: true }] });
    }
    assert.match(prompt, /"textType":"abstract"/);
    return JSON.stringify({ assessments: [{ id: 0, findings: [{
      ...makeFinding(paper),
      passageIndex: 0,
      stance: "neutral", match: "indirect", strength: "weak",
      interpretation: "The abstract reports an association.",
    }] }] });
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.paperAware, true);
  const result = readAssessment(payload, [paper], readPlan(plan(), claim).targets);
  assert.equal(result[0].findings[0].passageId, paper.passage.id);
  assert.equal(result[0].findings[0].quote, abstractQuote);
  assert.equal(result[0].findings[0].match, "indirect");
});

test("only a quote retrieved from a source can be saved and cards stay scoped to the account", () => {
  const [page, metadata] = pageList([paperHit, { ...paperHit, textType: "metadata only" }]);
  const card = buildEvidenceCard(evidenceTopic, page, cardNotes, "card-1");
  assert.equal(card.textType, "abstract");
  assert.equal(card.quote, abstractQuote);
  assert.equal(card.url, paperHit.url);
  assert.deepEqual(card.authors, ["Example Author"]);
  assert.equal(card.year, 2024);
  assert.equal(buildEvidenceCard(evidenceTopic, page, { ...cardNotes, quote: "Tree cover caused fewer hospital visits." }, "card-2"), null);
  assert.equal(buildEvidenceCard(evidenceTopic, metadata, cardNotes, "card-3"), null);
  const withoutNotes = buildEvidenceCard({ motion: evidenceTopic.motion, claim }, page, { quote: abstractQuote }, "card-4");
  assert.equal(withoutNotes?.interpretation, "");
  assert.equal(withoutNotes?.limitation, "");
  assert.equal(withoutNotes?.side, null);
  assert.equal(suggestEvidenceQuote(page, "Fabricated words about the study."), abstractQuote);
  assert.equal(suggestEvidenceQuote(metadata), "");
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  saveEvidenceCards(storage, "student-a", [card]);
  assert.deepEqual(readEvidenceCards(storage, "student-a"), [card]);
  assert.deepEqual(readEvidenceCards(storage, "student-b"), []);
});

test("a metadata-only paper can be opened but cannot become an evidence card", () => {
  const [page] = pageList([{ ...paperHit, textType: "metadata only" }]);
  const snapshot = { claim, plan: readPlan(plan(), claim), pages: [page], selected: [], searches: [], calls: 1 };
  const result = { state: "complete", snapshot, assessments: [], review: reviewEvidence(snapshot, []), caveats: [] };
  const html = renderToStaticMarkup(React.createElement(EvidenceResults, {
    result, retry() {}, retrying: false, canRetry: true, topic: evidenceTopic, onSave() {}, onPractice() {},
  }));
  assert.match(html, /Citation only/);
  assert.match(html, /Open paper via DOI/);
  assert.doesNotMatch(html, /Use this quote/);
});

test("motion research searches planned factual questions within the existing budget", async () => {
  const motion = "Cities should invest in more urban trees.";
  const targets = [
    { text: "Tree cover reduces hospital visits in urban districts.", outcome: "hospital visits", causal: true, qualifiers: [{ kind: "location", text: "urban districts" }] },
    { text: "Tree cover lowers summer temperatures.", outcome: "summer temperatures", causal: true, qualifiers: [] },
  ];
  const planned = await handleVerification({ version, action: "plan_verification", claim: motion, researchMode: "motion" }, async prompt => {
    assert.match(prompt, /factual yes\/no questions/);
    return JSON.stringify({ complete: true, targets, counterQuery: "counter", primaryQuery: "primary" });
  });
  assert.equal(planned.status, 200);
  const motionPlan = await planned.json();
  assert.deepEqual(motionPlan.targets[0].qualifiers, targets[0].qualifiers);
  const queries = [];
  const result = await runInvestigation(motion, async (name, body) => {
    if (name === "exa-search") {
      queries.push(body.query);
      return { ok: true, provider: body.provider ?? "exa", results: body.provider === "openalex" ? [paperHit] : [] };
    }
    if (body.action === "plan_verification") {
      assert.equal(body.researchMode, "motion");
      return motionPlan;
    }
    return batch(pageList(body.sources), () => []);
  }, activeSignal(), () => {}, "motion");
  assert.equal(result.state, "complete");
  assert.ok(queries.length <= 5);
  for (const target of targets) assert.ok(queries.some(query => query.includes(target.text)));
  const html = renderToStaticMarkup(React.createElement(EvidenceResults, {
    result, retry() {}, retrying: false, canRetry: true, mode: "motion",
  }));
  assert.match(html, /Factual questions behind the motion/);
  for (const target of targets) assert.ok(html.includes(target.text));
  assert.doesNotMatch(html, /Supports the claim/);
});

test("the argument comparison marks edited wording and preserves both original texts", () => {
  const original = "Tree cover proves that heat illness fell.";
  const revision = "Tree cover was linked to lower heat illness.";
  const diff = compareArgumentWording(original, revision);
  assert.equal(diff.original.map(part => part.text).join(""), original);
  assert.equal(diff.revised.map(part => part.text).join(""), revision);
  assert.equal(diff.original.find(part => part.text.includes("proves"))?.changed, true);
  assert.equal(diff.revised.find(part => part.text.includes("was linked"))?.changed, true);
  assert.equal(diff.original.find(part => part.text.includes("Tree cover"))?.changed, false);
  assert.ok(compareArgumentWording(original, original).revised.every(part => !part.changed));
});

test("evidence practice validates exact spans for an association, revision, and unused source", async () => {
  const card = buildEvidenceCard(evidenceTopic, pageList([paperHit])[0], cardNotes, "card-1");
  const original = "This study proves that planting trees prevents hospital visits.";
  const revision = "In the surveyed districts, greater tree cover was associated with fewer heat-related hospital visits.";
  const challenge = {
    question: "Does an association show that planting trees caused the decrease?",
    studentSpan: "proves that planting trees prevents hospital visits",
    sourceSpan: "was associated with fewer heat-related hospital visits",
  };
  const challenged = await assessEvidencePractice({ action: "evidence_challenge", card, original }, async prompt => {
    assert.ok(prompt.includes(abstractQuote));
    assert.match(prompt, /association does not establish causation/);
    return JSON.stringify(challenge);
  });
  assert.deepEqual(challenged.body, { ok: true, challenge });
  const feedback = {
    original: { status: "overstated", explanation: "The abstract reports an association.", studentSpan: challenge.studentSpan, sourceSpan: challenge.sourceSpan },
    revised: { status: "accurate", explanation: "The revision preserves the study’s scope and reports an association.", studentSpan: "In the surveyed districts", sourceSpan: challenge.sourceSpan },
    nextStep: "Look for a study designed to test causation.",
  };
  const request = { action: "evidence_feedback", card, original, revision, challenge: challenged.body.challenge };
  assert.deepEqual((await assessEvidencePractice(request, async () => JSON.stringify(feedback))).body, { ok: true, feedback });
  const unused = { status: "source_not_used", explanation: "This argument did not draw on the abstract.", studentSpan: null, sourceSpan: null };
  const unusedResult = await assessEvidencePractice({ ...request, revision: "Trees look lovely in every city." }, async () => JSON.stringify({ ...feedback, revised: unused }));
  assert.deepEqual(unusedResult.body.feedback?.revised, unused);
  const fabricated = { ...feedback, revised: { ...feedback.revised, sourceSpan: "randomized controlled trial" } };
  assert.equal((await assessEvidencePractice(request, async () => JSON.stringify(fabricated))).status, 502);
  assert.equal((await assessEvidencePractice(request, async () => { throw new Error("Unavailable"); })).status, 502);
});

test("Edge verification audits the meaning and provenance of each quoted passage", async () => {
  const page = makeHit("a");
  const edge = await handleVerification({
    version, action: "verify_passages", claim, plan: plan(), sources: [page],
  }, async prompt => {
    if (prompt.startsWith("Verify proposed")) return JSON.stringify({ checks: [{ key: "0:0", decision: "indirect", recordConfirmed: false }] });
    return JSON.stringify({ assessments: [{ id: 0, findings: [{
      ...makeFinding(pageList([page])[0]), passageIndex: 0, quote: "Provider text cannot replace the indexed passage.",
    }] }] });
  });
  assert.equal(edge.status, 200);
  const result = await edge.json();
  assert.equal(result.assessments[0].findings[0].match, "indirect");
  assert.equal(result.assessments[0].findings[0].record, null);
  assert.equal(result.assessments[0].findings[0].stance, "neutral");
  assert.equal(result.assessments[0].findings[0].quote, page.text);
  const malformed = await handleVerification({
    version, action: "verify_passages", claim, plan: plan(), sources: [page],
  }, async () => JSON.stringify({ assessments: [{ id: 17, findings: [] }] }));
  assert.equal(malformed.status, 502);
});

test("a malformed batch is split and only audited article summaries reach the result", async () => {
  const sources = [makeHit("summary-a"), makeHit("summary-b", positive2), makeHit("summary-broken")];
  const claimPlan = readPlan(plan(), claim);
  const summary = "The article reports fewer cases of heat-related illness where urban trees were planted.";
  const edge = await handleVerification({
    version, action: "verify_passages", claim, plan: plan(), sources,
  }, async prompt => {
    if (prompt.startsWith("Verify proposed")) return JSON.stringify({
      checks: [], summaryChecks: [{ id: 0, supported: true }, { id: 1, supported: false }],
    });
    const group = JSON.parse(prompt.split("SOURCE EXCERPTS: ")[1]);
    if (group.some(page => page.url.endsWith("broken"))) return '{"assessments":[]}';
    return JSON.stringify({ assessments: group.map(({ id }) => ({
      id, findings: [], articleSummary: { text: summary, passageIndex: 0 },
    })) });
  });
  assert.equal(edge.status, 200);
  const result = await edge.json();
  assert.deepEqual(result.unassessedIds, [sources[2].url]);
  assert.equal(result.assessments[0].articleSummary.text, summary);
  assert.equal(result.assessments[0].articleSummary.quote, positive);
  assert.equal(result.assessments[1].articleSummary, undefined);
  const pages = pageList(sources);
  const snapshot = { claim, plan: claimPlan, pages, selected: pages, searches: [], calls: 2 };
  const assessments = readAssessment(result, pages.slice(0, 2), claimPlan.targets);
  const html = safeHtml({ state: "complete", snapshot, assessments, review: reviewEvidence(snapshot, assessments), caveats: [] });
  assert.match(html, /Article summary/);
  const summaryDetails = html.match(/<details[^>]*><summary>Article summary<\/summary>(.*?)<\/details>/)?.[1];
  assert.ok(summaryDetails?.includes(summary));
  assert.ok(summaryDetails.includes(`<blockquote>${positive}</blockquote>`));
  assert.match(html, /Unassessed/);
});

test("official text can directly answer a named provision without needing a duplicate record", () => {
  const checked = "Article 19 of the Indian Constitution gives foreign nationals the right to assemble peacefully.";
  const quote = "19. Protection of certain rights. All citizens shall have the right to assemble peaceably and without arms.";
  const hit = { url: "https://www.indiacode.nic.in/constitution.pdf", title: "Constitution of India", text: quote };
  const options = {
    claim: checked,
    plan: plan(checked, "assemble peacefully", { targets: [{
      text: checked, outcome: "assemble peacefully", qualifiers: [{ kind: "population", text: "foreign nationals" }],
    }] }),
    findings: page => [makeFinding(page, {
      stance: "contradicts", interpretation: "Article 19 names citizens as the holders of the assembly right.",
      record: { type: "law", relation: "primary", url: page.url, proof: quote },
    })],
  };
  const result = scored([hit], options);
  assert.equal(result.review.status, "refuted");
  assert.match(result.review.reason, /official text.*named provision/);
  assert.equal(scored([{ ...hit, url: "https://unofficial.example/constitution.pdf" }], options).review.status, "insufficient");
});

test("reference snapshots abstain appropriately and all displayed factual findings carry usable citations", () => {
  for (const fixture of referenceCases) {
    const result = scored(fixture.page ? [fixture.page] : [], {
      claim: fixture.claim,
      plan: plan(fixture.claim, fixture.outcome),
      findings: page => [makeFinding(page, {
        stance: fixture.reference, strength: "weak", interpretation: fixture.interpretation, record: null,
      })],
    });
    assert.equal(result.review.status, fixture.expected, fixture.id);
    const html = safeHtml(result);
    assert.doesNotMatch(html, /confidence|\d+%/i);
    for (const { page, finding } of result.review.summary) {
      assert.ok(page.passage.text.includes(finding.quote), fixture.id);
      assert.ok(page.url === fixture.page.url, fixture.id);
      assert.ok(html.includes(`href="${page.url}"`), fixture.id);
      assert.match(html, /<summary>Source details \[1\]/);
      const citation = [...html.matchAll(/<figure class="evidence-quotation"><blockquote>(.*?)<\/blockquote><figcaption>(.*?)<\/figcaption><\/figure>/g)]
        .find(([, quote, caption]) => quote === renderToStaticMarkup(React.createElement("span", null, finding.quote)).slice(6, -7)
          && caption.includes(`href="${page.url}"`));
      assert.ok(citation, fixture.id);
    }
  }
});

test("an original agency dataset can verify a linked secondary page only for the named record", () => {
  const title = "Northborough Summer Heat Emergency Dataset";
  const primary = {
    url: "https://data.example/heat-emergencies?edition=2024",
    title,
    text: `This agency publishes its original observations. ${positive}`,
  };
  const secondary = {
    url: "https://news.example/heat",
    title: "News coverage",
    links: [primary.url],
    text: `The ${title} reports the following. ${positive2}`,
  };
  const other = {
    ...secondary, url: "https://news.example/other",
    text: `The Northborough Winter Health Emergency Dataset reports the following. ${positive2}`,
  };
  const result = scored([primary, secondary, other], {
    findings: page => [makeFinding(page, {
      record: page.url === primary.url
        ? { type: "dataset", relation: "primary", url: page.url, proof: page.passage.text }
        : { type: "dataset", relation: "secondary", url: primary.url, title, proof: page.passage.text },
    })],
  });
  assert.equal(result.review.records.length, 1);
  assert.equal(result.review.records[0].pages.length, 2);
  assert.equal(result.review.findings.find(entry => entry.page.url === other.url).recordId, null);
  assert.match(safeHtml(result), /dataset · 2 linked pages/);
});

test("Edge assessment reports a timeout while keeping invalid responses distinct", async () => {
  const input = { version, action: "verify_passages", claim, plan: plan(), sources: [makeHit("slow")] };
  const timeout = await handleVerification(input, async () => {
    throw new DOMException("Timed out", "TimeoutError");
  });
  assert.equal(timeout.status, 504);
  assert.match((await timeout.json()).error, /Retry to use the sources already retrieved/);
  const invalid = await handleVerification(input, async () => '{"assessments":[]}');
  assert.equal(invalid.status, 502);
});

test("a provider rate limit stops the investigation without automatic split retries", async () => {
  const fixture = scenario({ search: query => query === claim ? Array.from({ length: 11 }, (_, index) => makeHit(`limited-${index}`)) : [], verify: () => { throw Object.assign(new Error("Provider rate limit"), { status: 429 }); } });
  const result = await fixture.run();
  assert.equal(result.state, "unavailable");
  assert.equal(fixture.calls.filter(call => call.body.action === "verify_passages").length, 1);
  assert.equal(result.snapshot.pages.length, 11);
  assert.match(result.reason, /rate limit/i);
});

test("provider quota and capacity failures do not fan out into split requests", async () => {
  for (const status of [400, 429, 503]) {
    let calls = 0;
    const response = await handleVerification({ version, action: "verify_passages", claim, plan: plan(), sources: [makeHit("quota-a"), makeHit("quota-b")] }, async () => {
      calls++;
      throw Object.assign(new Error(`Gemini request failed with status ${status}`), { status });
    });
    assert.equal(calls, 1);
    assert.equal(response.status, status === 400 ? 502 : status);
    if (status !== 400) assert.equal(response.headers.get("Retry-After"), "60");
  }
});

test("versioned Edge actions preserve legacy Vite classify and search response contracts", async t => {
  const originalFetch = globalThis.fetch;
  const originalDeno = globalThis.Deno;
  const handlers = [];
  const requests = [];
  const edgeHooks = registerHooks({
    load(url, context, nextLoad) {
      return /\/(assess-evidence|exa-search)\/index\.ts$/.test(url) ? transpile(url) : nextLoad(url, context);
    },
    resolve(specifier, context, nextResolve) {
      if (specifier === "../_shared/http.ts") {
        return {
          shortCircuit: true,
          url: "data:text/javascript,export const withCors = handler => handler; export const guardUserRequest = async () => null;",
        };
      }
      return nextResolve(specifier, context);
    },
  });
  try {
    globalThis.Deno = { env: { get: () => "fixture-only" }, serve: handler => handlers.push(handler) };
    globalThis.fetch = async (url, request) => {
      const body = JSON.parse(request.body);
      requests.push(body);
      if (url.startsWith("https://api.exa.ai/")) return Response.json({
        results: [{ ...makeHit("a"), extras: { links: ["https://example.org/report"] } }],
      });
      if (url === "https://api.tavily.com/search") {
        assert.equal(request.headers.Authorization, "Bearer fixture-only");
        return Response.json({ results: [
          { url: "https://sci.gov.in/example", raw_content: "Introduction ".repeat(190) + "Article 19 of the Constitution addresses rights in India." },
          { url: "https://sci.gov.in/snippet", content: "An unverified search snippet." },
          { url: "javascript:alert(1)", raw_content: "Invalid source" },
        ] });
      }
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        assessments: [{ id: 7, stance: "supports", strength: "strong", finding: "Direct evidence." }],
      }) }] } }] });
    };
    await import("../../app/supabase/functions/assess-evidence/index.ts");
    await import("../../app/supabase/functions/exa-search/index.ts");
    const [assess, search] = handlers;
    const post = body => new Request("https://fixture.example/function", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const legacy = await assess(post({ action: "classify", claim, sources: [{ id: 7, title: "Trial", text: positive }] }));
    assert.equal(legacy.status, 200);
    assert.deepEqual(await legacy.json(), {
      ok: true, assessments: [{ id: 7, stance: "supports", strength: "strong", finding: "Direct evidence." }],
    });
    const legacySearch = await (await search(post({ query: "x".repeat(450) }))).json();
    assert.equal(requests.at(-1).query.length, 300);
    assert.ok(!Object.hasOwn(legacySearch.results[0], "links"));
    const newSearch = await (await search(post({ version, query: "x".repeat(450) }))).json();
    assert.equal(requests.at(-1).query.length, 450);
    assert.deepEqual(requests.at(-1).contents.extras, { links: 30 });
    assert.deepEqual(newSearch.results[0].links, ["https://example.org/report"]);
    const legacyWithProvider = await (await search(post({ query: "Article 19 in India", provider: "tavily" }))).json();
    assert.ok(!Object.hasOwn(legacyWithProvider, "provider"));
    assert.equal(requests.at(-1).numResults, 4);
    const alternative = await (await search(post({ query: "Article 19 Constitution rights in India", version, provider: "tavily" }))).json();
    assert.equal(alternative.provider, "tavily");
    assert.equal(requests.at(-1).include_raw_content, "text");
    assert.equal(requests.at(-1).include_answer, false);
    assert.ok(requests.at(-1).include_domains.includes("sci.gov.in"));
    assert.equal(alternative.results.length, 2);
    assert.match(alternative.results[0].text, /Article 19 of the Constitution/);
    assert.equal(alternative.results[1].text, "");
    await t.test("schema rejection still falls back after a transient provider retry", async () => {
      const sent = [];
      globalThis.fetch = async (_url, request) => {
        sent.push(JSON.parse(request.body));
        if (sent.length === 1) return Response.json({ error: { message: "Temporary capacity" } }, { status: 503 });
        if (sent.length === 2) return Response.json({ error: { message: "The specified schema produces a constraint that has too many states" } }, { status: 400 });
        return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(plan()) }] } }] });
      };
      const result = await assess(post({ version, action: "plan_verification", claim }));
      assert.equal(result.status, 200);
      assert.equal((await result.json()).targets.length, 1);
      assert.equal(sent.length, 3);
      assert.ok(sent[1].generationConfig.responseJsonSchema);
      assert.equal(sent[1].generationConfig.responseJsonSchema.properties.targets.maxItems, undefined);
      assert.deepEqual(sent[1].generationConfig.responseJsonSchema.required, ["policy","complete","targets","counterQuery","primaryQuery"]);
      assert.equal(sent[2].generationConfig.responseJsonSchema, undefined);
      assert.equal(sent[2].generationConfig.responseMimeType, "application/json");
    });
    await t.test("a schema-free rejection stops instead of retrying indefinitely", async () => {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return Response.json({ error: { message: "Invalid request fixture" } }, { status: 400 }); };
      const result = await assess(post({ version, action: "plan_verification", claim }));
      assert.equal(result.status, 502);
      assert.equal(calls, 2);
    });
  } finally {
    edgeHooks.deregister();
    globalThis.fetch = originalFetch;
    if (originalDeno) globalThis.Deno = originalDeno;
    else delete globalThis.Deno;
  }
});

for (const status of [429, 503]) {
  test(`a planning ${status} stops later AI and search calls while retaining initial sources`, async () => {
    const calls = [];
    const result = await runInvestigation(claim, async (name, body) => {
      calls.push({name,body});
      if (name === "exa-search") return {ok:true,provider:body.provider ?? "exa",results:body.provider === "openalex" ? [] : [makeHit("saved")]};
      throw Object.assign(new Error("Planning provider busy"), {status});
    }, activeSignal(), () => {});
    assert.equal(result.state,"unavailable");
    assert.equal(result.snapshot.pages.length,1);
    assert.equal(result.snapshot.planningNeedsRetry,true);
    assert.equal(result.snapshot.providerBackoff,true);
    assert.equal(calls.filter(call=>call.name === "assess-evidence").length,1);
    assert.equal(calls.filter(call=>call.name === "exa-search").length,2);
    assert.equal(canRetryAssessment(result),true);
  });
}
test("an explicit retry can restore planning and assess saved sources without repeating searches", async () => {
  let planning = 0; let searching = 0; let assessing = 0;
  const request = async (name,body) => {
    if (name === "exa-search") { searching++; return {ok:true,provider:body.provider ?? "exa",results:body.provider === "openalex" ? [] : [makeHit("saved-retry")]}; }
    if (body.action === "plan_verification") {
      if (++planning === 1) throw Object.assign(new Error("Planning busy"),{status:503});
      return plan();
    }
    assessing++; return batch(pageList(body.sources));
  };
  const first = await runInvestigation(claim,request,activeSignal(),()=>{});
  const second = await retryAssessment(first,request,activeSignal(),()=>{});
  assert.equal(second.state,"complete"); assert.equal(second.snapshot.planningNeedsRetry,false);
  assert.equal(planning,2); assert.equal(searching,2); assert.equal(assessing,1);
  assert.equal(second.snapshot.calls,3);
});
