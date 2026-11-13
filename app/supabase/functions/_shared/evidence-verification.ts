export const VERIFICATION_VERSION = 2;
export const MAX_EVIDENCE_PAGES = 12;
export const MAX_EXCERPT_LENGTH = 3600;

const stances = ["supports", "contradicts", "neutral", "irrelevant"] as const;
const strengths = ["strong", "moderate", "weak"] as const;
const recordTypes = ["study", "dataset", "law", "court decision", "agency report", "primary record"] as const;
const qualifierTypes = ["population", "location", "timeframe", "outcome", "causality"] as const;
const tracking = new Set(["fbclid", "gclid", "dclid", "msclkid", "mc_cid", "mc_eid", "igshid"]);

export type Stance = typeof stances[number];
export type Strength = typeof strengths[number];
export type RecordType = typeof recordTypes[number];
export type Target = {
  id: string;
  text: string;
  outcome: string;
  causal: boolean;
  qualifiers: { kind: typeof qualifierTypes[number]; text: string }[];
};
export type Plan = {
  policy: boolean;
  complete: boolean;
  targets: Target[];
  counterQuery: string;
  primaryQuery: string;
};
export type Passage = { id: string; sourceId: string; text: string; scope: "retrieved excerpt" | "abstract" | "metadata only" };
export type Paper = {
  provider: "openalex";
  workId: string;
  providerUrl: string;
  landingUrl: string | null;
  title: string;
  doi: string | null;
  authors: string[];
  year: number | null;
  type: string | null;
};
export type Page = {
  id: string;
  url: string;
  title: string;
  date: string | null;
  author: string | null;
  links: string[];
  paper?: Paper;
  passage: Passage;
};
type RecordProof = {
  type: RecordType;
  relation: "primary" | "secondary";
  url: string;
  proof: string;
  aliases: string[];
  title: string | null;
};
export type Finding = {
  targetId: string;
  passageId: string;
  quote: string;
  interpretation: string;
  stance: Stance;
  strength: Strength;
  match: "direct" | "indirect";
  limitation: string;
  record: RecordProof | null;
};
export type ArticleSummary = { text: string; quote: string };
export type Assessment = { id: string; findings: Finding[]; articleSummary?: ArticleSummary };

export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

export function safeSourceUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.length > 2500) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && !url.username && !url.password ? url : null;
  } catch { return null; }
}

export function canonicalPageUrl(value: unknown): string | null {
  const url = safeSourceUrl(value);
  if (!url) return null;
  // Ordinary anchors point into a document. Hash-router paths can identify different documents.
  if (!/^#!?\//.test(url.hash)) url.hash = "";
  const parameters = url.search.slice(1).split("&").filter(parameter => {
    const key = new URLSearchParams(parameter).keys().next().value?.toLowerCase() ?? "";
    return !key.startsWith("utm_") && !tracking.has(key);
  });
  url.search = parameters.join("&");
  return url.href;
}

export function excerptQuote(text: string, quote: unknown): string | null {
  if (typeof quote !== "string" || quote.length > 650) return null;
  const target = quote.trim().replace(/\s+/g, " ");
  if (target.length < 12) return null;
  const words = target.split(" ").map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const start = /^[\p{L}\p{N}]/u.test(target) ? "(?<![\\p{L}\\p{N}])" : "";
  const end = /[\p{L}\p{N}]$/u.test(target) ? "(?![\\p{L}\\p{N}])" : "";
  return text.match(new RegExp(start + words.join("\\s+") + end, "u"))?.[0] ?? null;
}

function fingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function doiUrl(value: unknown): string | null {
  const identity = resolverIdentity(value);
  return identity?.startsWith("doi:") ? `https://doi.org/${identity.slice(4)}` : null;
}

function readPaper(value: unknown): Paper | undefined {
  const paper = object(value);
  if (paper?.provider !== "openalex" || typeof paper.workId !== "string" || !/^W\d{1,20}$/.test(paper.workId)) return;
  const title = bounded(paper.title, 2000);
  if (!title) return;
  const authors = Array.isArray(paper.authors) ? paper.authors.slice(0, 100)
    .map(name => bounded(name, 200)).filter(Boolean) : [];
  return {
    provider: "openalex", workId: paper.workId, providerUrl: `https://openalex.org/${paper.workId}`,
    doi: doiUrl(paper.doi), landingUrl: canonicalPageUrl(paper.landingUrl), title, authors,
    year: typeof paper.year === "number" && Number.isInteger(paper.year) && paper.year > 0 && paper.year <= 9999
      ? paper.year : null,
    type: bounded(paper.type, 60) || null,
  };
}

export function readSearchPages(response: unknown): Page[] {
  const data = object(response);
  if (data?.ok !== true || !Array.isArray(data.results)) throw new Error("Search returned an invalid response.");
  return data.results.flatMap((value): Page[] => {
    const result = object(value);
    const paper = readPaper(result?.paper);
    if (result?.paper && !paper) return [];
    const url = canonicalPageUrl(result?.url);
    const id = paper ? paper.doi ?? paper.providerUrl : doiUrl(url) ?? url;
    if (!id || !url || typeof result?.url !== "string") return [];
    // DOI matches can carry paper metadata alongside a separately retrieved web excerpt.
    const retrieved = typeof result.text === "string" ? result.text.slice(0, MAX_EXCERPT_LENGTH) : "";
    const scope = !paper || (result.textType === "retrieved excerpt" && paper.doi && doiUrl(url) === paper.doi)
      ? "retrieved excerpt" : result.textType === "abstract" && retrieved.trim() ? "abstract" : "metadata only";
    const text = scope === "metadata only" ? "" : retrieved;
    return [{
      id, url: result.url, title: bounded(result.title, 250) || id,
      date: bounded(result.publishedDate, 40) || null,
      author: bounded(result.author, 200) || null,
      links: (Array.isArray(result.links) ? result.links : []).slice(0, 30).flatMap(value => {
        const link = canonicalPageUrl(value);
        return link ? [link] : [];
      }),
      ...(paper ? { paper } : {}),
      passage: {
        id: `${id}#passage-${fingerprint(scope === "abstract" ? `abstract:\n${text}` : text)}`,
        sourceId: id, text, scope,
      },
    }];
  });
}

function bounded(value: unknown, max: number): string {
  return typeof value === "string" && value.trim().length <= max ? value.trim() : "";
}

function includesText(text: string, span: string): boolean {
  return text.toLowerCase().replace(/\s+/g, " ").includes(span.toLowerCase().replace(/\s+/g, " "));
}

const stopWords = new Set("the and from with that this into were been they their when where what does have has will would should could than then".split(" "));
export function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => word.length > 2 && !stopWords.has(word))
    .map(word => word.length > 4 ? word.replace(/(?:ies|s)$/, ending => ending === "ies" ? "y" : "") : word));
}

function outcomePresent(outcome: string, quote: string): boolean {
  const normalize = (value: string) => value
    .replace(/\bpeaceabl[ey]\b/gi, "peacefully")
    .replace(/\bnon[ -]citizens?\b|\bforeign nationals?\b|\bforeigners?\b/gi, "foreigner");
  const wanted = [...terms(normalize(outcome))];
  const present = terms(normalize(quote));
  return wanted.length > 0 && wanted.every(term => present.has(term));
}

function provisionNumber(text: string): string | undefined {
  const provision = text.match(/\b(?:article|section)\s+(\d+[a-z]?)\b/i)
    ?? text.match(/^\s*(\d+[a-z]?)\.\s+\S/i);
  return provision?.[1].toLowerCase();
}

export function isOfficialIndianLawPage(page: Page) {
  const host = safeSourceUrl(page.url)?.hostname;
  return Boolean(host && /(?:^|\.)(?:indiacode\.nic\.in|legislative\.gov\.in)$/.test(host));
}

export function isDirectStatutoryText(page: Page, finding: Finding, target: Target) {
  const provision = provisionNumber(target.text);
  return Boolean(isOfficialIndianLawPage(page) && !target.causal
    && finding.record?.type === "law" && finding.record.relation === "primary"
    && finding.strength === "strong" && finding.match === "direct"
    && provision && provisionNumber(finding.quote) === provision);
}

const policyPattern = /^(?:should|ought|is it (?:right|ethical)|what should)\b|\b(?:should|ought to|morally right|morally wrong)\b/i;
const compoundPattern = /\b(?:and|or|while|whereas|as well as)\b|;/i;
const causalPattern = /\b(?:caus\w*|lead\w* to|reduc\w*|increas\w*|lower\w*|rais\w*|prevent\w*|improv\w*|worsen\w*|result\w* in|due to)\b/i;
const associationPattern = /\b(?:associat\w*|correlat\w*)\b/i;
const isCausal = (text: string) => causalPattern.test(text) && !associationPattern.test(text);

export function fallbackPlan(claim: string): Plan {
  return {
    policy: policyPattern.test(claim),
    complete: false,
    targets: [{ id: "q1", text: claim, outcome: "", causal: isCausal(claim), qualifiers: [] }],
    counterQuery: `Evidence of no effect, exceptions or contrary results: ${claim}`,
    primaryQuery: `Original records or empirical research: ${claim}`,
  };
}

export function readPlan(response: unknown, claim: string): Plan {
  const data = object(response);
  const fallback = fallbackPlan(claim);
  if (data?.ok !== true || data.version !== VERIFICATION_VERSION || !Array.isArray(data.targets)) return fallback;
  const policy = fallback.policy || data.policy === true;
  const targets = data.targets.slice(0, 4).flatMap((raw, index): Target[] => {
    const target = object(raw);
    const text = bounded(target?.text, 500);
    const outcome = bounded(target?.outcome, 120);
    if (!text || !outcome || !includesText(policy ? text : claim, outcome)) return [];
    const qualifiers = (Array.isArray(target?.qualifiers) ? target.qualifiers : []).flatMap((rawQualifier): Target["qualifiers"] => {
      const qualifier = object(rawQualifier);
      const kind = qualifierTypes.find(value => value === qualifier?.kind);
      const span = bounded(qualifier?.text, 120);
      return kind && span && includesText(policy ? text : claim, span) ? [{ kind, text: span }] : [];
    }).slice(0, 8);
    return [{ id: `q${index + 1}`, text, outcome, causal: isCausal(text) || target?.causal === true, qualifiers }];
  });
  if (!targets.length || targets.length !== data.targets.length) return fallback;
  return {
    policy,
    complete: data.complete === true && targets.length === data.targets.length
      && (targets.length > 1 || !compoundPattern.test(claim)),
    targets,
    counterQuery: bounded(data.counterQuery, 500) || fallback.counterQuery,
    primaryQuery: bounded(data.primaryQuery, 500) || fallback.primaryQuery,
  };
}

export function resolverIdentity(value: unknown): string | null {
  const url = safeSourceUrl(value);
  if (!url) return null;
  if (/^(?:dx\.)?doi\.org$/i.test(url.hostname) && /^\/10\.\d{4,9}\/.+/.test(url.pathname)) {
    return `doi:${url.pathname.slice(1).toLowerCase()}`;
  }
  if (url.hostname === "pubmed.ncbi.nlm.nih.gov" && /^\/\d+\/?$/.test(url.pathname)) {
    return `pmid:${url.pathname.replace(/\//g, "")}`;
  }
  return null;
}

function identifierIn(proof: string, identity: string): boolean {
  const identifier = identity.slice(identity.indexOf(":") + 1);
  if (identity.startsWith("doi:")) {
    return [...proof.matchAll(/\b10\.\d{4,9}\/[^\s<>"\]]+/gi)]
      .some(match => match[0].toLowerCase() === identifier
        || match[0].replace(/[.,;:)]+$/, "").toLowerCase() === identifier);
  }
  return [...proof.matchAll(/(?:PMID\s*[:#]?\s*|pubmed\.ncbi\.nlm\.nih\.gov\/)(\d+)/gi)]
    .some(match => match[1] === identifier);
}

function readRecord(value: unknown, page: Page, quote: string): RecordProof | null {
  const record = object(value);
  const type = recordTypes.find(value => value === record?.type);
  const proof = excerptQuote(page.passage.text, record?.proof);
  const url = canonicalPageUrl(record?.url);
  if (!type || !proof || !url || (record?.relation !== "primary" && record?.relation !== "secondary")) return null;
  const identity = resolverIdentity(url);
  if (record.relation === "secondary") {
    // An outbound link counts only if the cited passage identifies that record
    // and the same title is corroborated by a retrieved primary page.
    const explicit = identity ? identifierIn(quote, identity) : quote.includes(url);
    const title = bounded(record.title, 200);
    const matchedTitle = title && terms(title).size >= 4 && page.links.includes(url) && includesText(proof, title);
    return (explicit || matchedTitle) && quote.includes(proof)
      ? { type, relation: "secondary", url, proof, aliases: [], title: explicit ? null : title } : null;
  }
  // A provider work ID or DOI identifies the abstract's record, but the
  // model still has to cite exact text and the audit must confirm provenance.
  const paper = page.passage.scope === "abstract" ? page.paper : undefined;
  const matchesPaperDoi = paper?.doi && doiUrl(url) === paper.doi;
  if (paper && (type !== "study" || (url !== page.id && url !== paper.providerUrl && !matchesPaperDoi))) return null;
  // The resolver itself is direct metadata. Other pages must explicitly identify their own record.
  const self = resolverIdentity(page.id);
  if (!paper && url !== page.id && (!identity || (identity !== self && !identifierIn(proof, identity)))) return null;
  if ((url !== page.id || !self) && terms(proof).size < 5) return null;
  const aliases = Array.isArray(record.aliases)
    ? record.aliases.flatMap(value => {
        const alias = canonicalPageUrl(value);
        const identifier = resolverIdentity(alias);
        return alias && identifier && identifierIn(proof, identifier) ? [alias] : [];
      }).slice(0, 2)
    : [];
  return { type, relation: "primary", url: paper ? page.id : url, proof, aliases, title: null };
}

export function readAssessment(response: unknown, pages: Page[], targets: Target[]): Assessment[] {
  const data = object(response);
  if (data?.ok !== true || data.version !== VERIFICATION_VERSION || !Array.isArray(data.assessments)
    || data.assessments.length !== pages.length) throw new Error("Assessment returned an incomplete or invalid batch.");
  const pageById = new Map(pages.map(page => [page.id, page]));
  const targetById = new Map(targets.map(target => [target.id, target]));
  return data.assessments.map((raw): Assessment => {
    const entry = object(raw);
    const page = typeof entry?.id === "string" ? pageById.get(entry.id) : undefined;
    if (!page || !Array.isArray(entry?.findings) || entry.findings.length > 8) {
      throw new Error("Assessment returned a duplicate, unknown, or invalid page.");
    }
    pageById.delete(page.id);
    const findings = entry.findings.flatMap((rawFinding): Finding[] => {
      const raw = object(rawFinding);
      const target = typeof raw?.targetId === "string" ? targetById.get(raw.targetId) : undefined;
      const stance = stances.find(value => value === raw?.stance);
      const strength = strengths.find(value => value === raw?.strength);
      const interpretation = bounded(raw?.interpretation, 300);
      const limitation = bounded(raw?.limitation, 300);
      if (!target || raw?.passageId !== page.passage.id || !stance || !strength || !interpretation
        || (raw?.match !== "direct" && raw?.match !== "indirect") || typeof raw?.limitation !== "string"
        || (raw.limitation.length > 0 && !limitation) || typeof raw?.quote !== "string") {
        throw new Error("Assessment returned a malformed finding.");
      }
      const quote = excerptQuote(page.passage.text, raw.quote);
      if (!quote) throw new Error("Assessment cited text absent from the retrieved passage.");
      const record = readRecord(raw.record, page, quote);
      const expressesCitizenRestriction = record?.type === "law" && record.relation === "primary"
        && isOfficialIndianLawPage(page)
        && provisionNumber(target.text) && provisionNumber(target.text) === provisionNumber(quote)
        && /\b(?:all|only|every) citizens?\b/i.test(quote);
      const outcomeMatched = outcomePresent(target.outcome, quote);
      const missingQualifier = target.qualifiers.find(qualifier =>
        qualifier.kind !== "causality" && qualifier.kind !== "outcome" && !outcomePresent(qualifier.text, quote)
        && !(expressesCitizenRestriction && qualifier.kind === "population" && /\b(?:foreign|non.?citizen)/i.test(qualifier.text))
      );
      const causalDesign = /\b(?:randomi[sz]\w*|controlled trial|quasi.experimental|natural experiment|difference.in.differences|regression discontinuity)\b/i.test(quote);
      const direct = raw.match === "direct" && outcomeMatched && !missingQualifier && (!target.causal || causalDesign);
      const gap = !outcomeMatched ? "The quoted text does not identify the requested outcome."
        : missingQualifier ? `The quoted text does not establish the requested ${missingQualifier.kind}: ${missingQualifier.text}.`
        : target.causal && !causalDesign ? "The quoted text does not establish a design that can support the causal claim."
        : limitation;
      return [{
        targetId: target.id, passageId: page.passage.id, quote,
        // A mismatched outcome cannot support an interpretation about the requested outcome.
        interpretation: !outcomeMatched || (!direct && raw.match === "direct") ? gap : interpretation,
        stance: outcomeMatched ? stance : "neutral",
        strength: direct ? strength : "weak",
        match: direct ? "direct" : "indirect",
        limitation: gap,
        record,
      }];
    });
    const summary = object(entry.articleSummary);
    const summaryText = bounded(summary?.text, 500);
    const summaryQuote = excerptQuote(page.passage.text, summary?.quote);
    return { id: page.id, findings, ...(summaryText && summaryQuote
      ? { articleSummary: { text: summaryText, quote: summaryQuote } } : {}) };
  });
}
