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
const {
  createInvestigationRun, mergePages, retryAssessment, reviewEvidence, runInvestigation,
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
  ok: true, version, assessments: pages.map(page => ({ id: page.id, findings: getFindings(page) })),
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
  assert.match(safeHtml(scored([a, b])), /Supported by retrieved evidence/);
  assert.match(safeHtml(scored([makeHit("na", negative), makeHit("nb", negative)], {
    findings: page => [makeFinding(page, { stance: "contradicts", interpretation: "The trial reported no reduction." })],
  })), /Refuted by retrieved evidence/);
  const conflicting = scored([makeHit("a", `${positive}\n${negative}`)], {
    findings: page => [
      makeFinding(page, { quote: positive }),
      makeFinding(page, { quote: negative, stance: "contradicts", interpretation: "A separate result in this trial reported no reduction." }),
    ],
  });
  const conflictHtml = safeHtml(conflicting);
  assert.equal(conflicting.review.weightedCount, 1);
  assert.match(conflictHtml, /Mixed evidence/);
  assert.match(conflictHtml, /Different findings within one record/);
  assert.doesNotMatch(conflictHtml, /No independently verified (?:supporting|challenging) finding/);
  const compound = "Urban trees reduce heat-related illness during summer and improve air quality.";
  const result = scored([a, b], {
    claim: compound,
    plan: plan(compound, outcome, { targets: [
      { text: claim, outcome },
      { text: "Urban trees improve air quality.", outcome: "air quality" },
    ] }),
  });
  assert.deepEqual(result.review.targets.map(target => target.status), ["supported", "insufficient"]);
  assert.match(safeHtml(result), /Unresolved.*air quality/);
  assert.match(safeHtml(result), /Insufficient evidence/);
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
  assert.match(html, /Policy evidence review/);
  assert.match(html, /policy decision is yours/);
  assert.match(html, /Factual premises and trade-offs/);
  assert.doesNotMatch(html, /Verdict from retrieved evidence/);
});

function scenario({ verify, search, trace = [] } = {}) {
  const calls = [];
  const request = async (name, body) => {
    calls.push({ name, body });
    if (name === "exa-search") return { ok: true, results: search ? await search(body.query) : [makeHit("a"), makeHit("b", positive2)] };
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
    assert.match(html, /Assessment unavailable/);
    assert.match(html, /Unassessed/);
    assert.match(html, /Full retrieved excerpt/);
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
      trace, search: lookup, verify: (pages, count) => count === 2 && shouldFail ? { ok: false } : classify(pages),
    });
    const result = await fixture.run();
    const batches = fixture.calls.filter(call => call.body.action === "verify_passages");
    assert.deepEqual(batches.map(call => call.body.sources.length), [12, 12]);
    assert.ok(batches[1].body.sources.some(page => page.url === added.url));
    assert.ok(trace.length <= 10);
    assert.ok(result.snapshot.searches.length <= 5);
    assert.equal(result.snapshot.pages.length, 13);
    if (shouldFail) {
      assert.equal(result.review.status, "supported");
      assert.equal(result.review.weightedCount, 2);
      assert.ok(!result.assessments.some(entry => entry.id === added.url));
      const html = safeHtml(result);
      assert.match(html, /Partial coverage/);
      assert.match(html, /Follow-up assessment was unavailable/);
      assert.match(html, /Unassessed/);
    } else {
      assert.equal(result.review.status, "mixed");
      assert.equal(result.review.weightedCount, 3);
    }
  }
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
  assert.match(trace.flatMap(step => step.notes).join(" "), /counter evidence · failed \(counter timed out\)/);
  assert.doesNotMatch(trace.flatMap(step => step.notes).join(" "), /confidence|\d+%/i);
});

test("Edge verification audits the meaning and provenance of each quoted passage", async () => {
  const page = makeHit("a");
  const edge = await handleVerification({
    version, action: "verify_passages", claim, plan: plan(), sources: [page],
  }, async prompt => {
    if (prompt.startsWith("Verify proposed")) return JSON.stringify({ checks: [{ key: "0:0", decision: "indirect", recordConfirmed: false }] });
    return JSON.stringify({ assessments: [{ id: 0, findings: [makeFinding(pageList([page])[0])] }] });
  });
  assert.equal(edge.status, 200);
  const result = await edge.json();
  assert.equal(result.assessments[0].findings[0].match, "indirect");
  assert.equal(result.assessments[0].findings[0].record, null);
  assert.equal(result.assessments[0].findings[0].stance, "neutral");
  const malformed = await handleVerification({
    version, action: "verify_passages", claim, plan: plan(), sources: [page],
  }, async () => JSON.stringify({ assessments: [{ id: 17, findings: [] }] }));
  assert.equal(malformed.status, 502);
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
      assert.match(html, /<summary>Inspect passage \[1\]/);
      assert.match(html, /<blockquote>/);
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

test("versioned Edge actions preserve legacy Vite classify and search response contracts", async () => {
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
  } finally {
    edgeHooks.deregister();
    globalThis.fetch = originalFetch;
    if (originalDeno) globalThis.Deno = originalDeno;
    else delete globalThis.Deno;
  }
});
