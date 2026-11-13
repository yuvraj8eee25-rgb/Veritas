import { doiUrl, object, safeSourceUrl } from "../_shared/evidence-verification.ts";
import type { Paper } from "../_shared/evidence-verification.ts";

const WORK_FIELDS = [
  "id", "doi", "title", "authorships", "publication_year", "publication_date", "primary_location",
  "abstract_inverted_index", "type", "is_retracted",
].join(",");
const PAPER_TYPES = "article|review|preprint|conference-paper|dissertation|book-chapter";
const PAPER_RESULTS = 8;

type PaperResult = {
  title: string;
  url: string;
  text: string;
  textType: "abstract" | "metadata only";
  publishedDate: string | null;
  paper: Paper;
};

// OpenAlex supplies word positions. Preserve their original order and punctuation,
// and reject corrupt indices so separated words cannot become a fabricated quote.
function readAbstract(value: unknown): string {
  const index = object(value);
  if (!index) return "";
  const words: string[] = [];
  const maxWords = 5000;
  for (const [word, positions] of Object.entries(index)) {
    if (!word.trim() || word.length > 1000 || !Array.isArray(positions) || positions.length > maxWords) return "";
    for (const position of positions) {
      if (typeof position !== "number" || !Number.isInteger(position)
        || position < 0 || position >= maxWords || words[position] !== undefined) return "";
      words[position] = word;
    }
  }
  for (let position = 0; position < words.length; position++) {
    if (words[position] === undefined) return "";
  }
  return words.join(" ");
}

export async function searchOpenAlex(query: string, key: string | undefined, excerpt: (text: string, query: string) => string) {
  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set("search", query);
  endpoint.searchParams.set("select", WORK_FIELDS);
  endpoint.searchParams.set("filter", `type:${PAPER_TYPES},is_retracted:false`);
  endpoint.searchParams.set("per_page", String(PAPER_RESULTS));
  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    headers: { Accept: "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
  });
  if (!response.ok) {
    const error = response.status === 429 ? "OpenAlex reached its own request limit."
      : response.status === 401 || response.status === 403 ? "OpenAlex denied the request. Check the server API key."
      : `OpenAlex returned HTTP ${response.status}.`;
    // Provider limits must not trigger Evidence Lab's shared request limit.
    return { status: 502, body: { ok: false, error } };
  }

  const payload = object(await response.json());
  if (!Array.isArray(payload?.results)) {
    return { status: 502, body: { ok: false, error: "OpenAlex returned an invalid search response." } };
  }
  const papers: PaperResult[] = [];
  for (const value of payload.results.slice(0, PAPER_RESULTS)) {
    const work = object(value);
    const providerUrl = safeSourceUrl(work?.id);
    const workId = providerUrl?.hostname === "openalex.org"
      ? providerUrl.pathname.match(/^\/(W\d{1,20})\/?$/)?.[1] : undefined;
    const title = typeof work?.title === "string" ? work.title.trim().slice(0, 2000) : "";
    if (!work || !workId || !title || work.is_retracted === true) continue;
    const doi = doiUrl(work.doi);
    const landing = safeSourceUrl(object(work.primary_location)?.landing_page_url);
    const recordUrl = `https://openalex.org/${workId}`;
    const text = excerpt(readAbstract(work.abstract_inverted_index), query);
    const year = typeof work.publication_year === "number" && Number.isInteger(work.publication_year)
      ? work.publication_year : null;
    const authors = (Array.isArray(work.authorships) ? work.authorships : []).slice(0, 100).flatMap(value => {
      const name = object(object(value)?.author)?.display_name;
      return typeof name === "string" && name.trim() ? [name.trim().slice(0, 200)] : [];
    });
    papers.push({
      title: title.slice(0, 250), url: doi ?? landing?.href ?? recordUrl, text, textType: text ? "abstract" : "metadata only",
      publishedDate: typeof work.publication_date === "string" ? work.publication_date : null,
      paper: { provider: "openalex", workId, providerUrl: recordUrl, landingUrl: landing?.href ?? null, title, doi, authors, year,
        type: typeof work.type === "string" ? work.type : null },
    });
  }
  if (payload.results.length && !papers.length) {
    return { status: 502, body: { ok: false, error: "OpenAlex returned no valid paper records." } };
  }
  const unique: PaperResult[] = [];
  for (const paper of papers) {
    const match = unique.findIndex(other => other.paper.workId === paper.paper.workId
      || (paper.paper.doi && other.paper.doi === paper.paper.doi));
    if (match < 0) unique.push(paper);
    else {
      const previous = unique[match];
      const best = !previous.text && paper.text ? paper : previous;
      const doi = previous.paper.doi ?? paper.paper.doi;
      unique[match] = { ...best, url: doi ?? best.url, paper: { ...best.paper, doi } };
    }
  }
  return { status: 200, body: { ok: true, provider: "openalex", results: unique } };
}
