import { ArrowDownRight, ArrowUpRight, Check, CircleAlert, Search } from "lucide-react";
import { useRef, useState } from "react";
import { safeSourceUrl } from "../../../app/supabase/functions/_shared/evidence-verification.ts";
import type { Page } from "../../../app/supabase/functions/_shared/evidence-verification.ts";
import type { CitedFinding, Investigation } from "../lib/evidence-investigation.ts";

import type { EvidenceCard, ResearchTopic } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import { suggestEvidenceQuote } from "../lib/evidence-cards.ts";
import { EvidenceCardEditor } from "./EvidenceCard.tsx";

function dateLabel(value: string | null) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? `Reported date ${date.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`
    : "Date unavailable";
}

function OriginalPage({ page }: { page: Page }) {
  const url = safeSourceUrl(page.url);
  return url && <a className="workspace-text-action" href={url.href} target="_blank" rel="noopener noreferrer">
    {page.paper ? url.href === page.paper.providerUrl ? "Open OpenAlex record"
      : url.href === page.paper.doi ? "Open paper via DOI" : "Open paper page" : "Open original page"}
    <ArrowUpRight size={15} aria-hidden="true" />
  </a>;
}

function PaperDetails({ page }: { page: Page }) {
  const paper = page.paper;
  if (!paper) return null;
  const authors = paper.authors.slice(0, 4).join(", ") + (paper.authors.length > 4 ? ", et al." : "");
  const details = [authors, paper.year].filter(Boolean).join(" · ");
  return <>
    {details && <p className="workspace-meta">{details}</p>}
    {paper.authors.length > 4 && <details className="research-passage">
      <summary>View author list</summary>
      <p className="workspace-meta">{paper.authors.join(", ")}</p>
    </details>}
  </>;
}

function PaperRecord({ page }: { page: Page }) {
  const record = safeSourceUrl(page.paper?.providerUrl);
  return record && record.href !== page.url && <a className="workspace-text-action" href={record.href}
    target="_blank" rel="noopener noreferrer">OpenAlex record <ArrowUpRight size={15} aria-hidden="true" /></a>;
}

function Citation({ item, number }: { item: CitedFinding; number: number }) {
  const { page, finding, recordId } = item;
  const recordUrl = recordId && finding.record ? safeSourceUrl(finding.record.url) : null;
  return <details className="research-passage">
    <summary>Source details [{number}]</summary>
    <PaperDetails page={page} />
    <p className="workspace-meta">
      {page.passage.scope === "abstract" ? "Abstract excerpt" : page.paper ? "Retrieved web excerpt" : "Retrieved excerpt"}
      {!page.paper && ` · ${dateLabel(page.date)}`} · {recordId && finding.record ? finding.record.type : "Source type or independence unverified"}
    </p>
    <a className="workspace-text-action" href={`#evidence-source-${number}`}>View source and card options</a>
    <OriginalPage page={page} />
    <PaperRecord page={page} />
    {recordUrl && finding.record?.relation === "secondary" && <a className="workspace-text-action"
      href={recordUrl.href} target="_blank" rel="noopener noreferrer">Open underlying record <ArrowUpRight size={15} aria-hidden="true" /></a>}
  </details>;
}

function FindingList({ findings, numbers }: { findings: CitedFinding[]; numbers: Map<string, number> }) {
  return <ul className="research-verification-findings">
    {findings.map((item, index) => <li key={`${item.page.passage.id}:${item.finding.targetId}:${index}`}>
      <SourceQuotation page={item.page} quote={item.finding.quote} />
      <p className="workspace-meta">Checked point · {item.targetText}</p>
      <p>{item.finding.interpretation}</p>
      {item.finding.limitation && <p className="evidence-source-limit"><strong>Limit:</strong> {item.finding.limitation}</p>}
      <p className="workspace-meta">{item.finding.match === "direct" ? "Direct" : "Indirect"} · {item.finding.strength} finding{!item.recordId ? " · independence unverified" : ""}</p>
      <Citation item={item} number={numbers.get(item.page.id)!} />
    </li>)}
  </ul>;
}

type CardActions = { topic?: ResearchTopic; onSave?: (card: EvidenceCard) => void; onPractice?: (card: EvidenceCard) => void };
type Source = { page: Page; finding?: CitedFinding; summary?: string; summaryQuote?: string; quote: string; assessed: boolean };

function sourceType(page: Page) {
  return page.passage.scope === "metadata only" || !page.passage.text.trim() ? "Citation only"
    : page.passage.scope === "abstract" ? "Abstract excerpt" : "Web excerpt";
}

function SourceQuotation({ page, quote }: { page: Page; quote: string }) {
  const title = page.paper?.title ?? page.title;
  const byline = page.paper
    ? [page.paper.authors.slice(0, 4).join(", ") + (page.paper.authors.length > 4 ? ", et al." : ""), page.paper.year].filter(Boolean).join(" · ")
    : page.author;
  const url = safeSourceUrl(page.url);
  return <figure className="evidence-quotation">
    <blockquote>{quote}</blockquote>
    <figcaption>
      <span>{sourceType(page)}{byline && ` · ${byline}`}</span>
      <cite>{url ? <a href={url.href} target="_blank" rel="noopener noreferrer">{title} <ArrowUpRight size={13} aria-hidden="true" /></a> : title}</cite>
    </figcaption>
  </figure>;
}

function Excerpt({ source }: { source: Source }) {
  return <details className="research-passage evidence-excerpt">
    <summary>Read excerpt</summary>
    <div>
      <blockquote className="evidence-selected-quote">{source.page.passage.text}</blockquote>
      <OriginalPage page={source.page} />
    </div>
  </details>;
}

function FeaturedSource({ source, direction, choose }: {
  source: Source; direction: "supports" | "contradicts" | undefined; choose?: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  const { page, quote, finding, assessed } = source;
  const relation = direction === "supports" ? "Supports the checked point" : "Challenges the checked point";
  return <article className="research-evidence-side evidence-featured-card" data-stance={direction}>
    <SourceQuotation page={page} quote={quote} />
    {direction && finding ? <p className="evidence-source-relation"><strong>{relation}</strong> · {finding.targetText}</p>
      : <p className="workspace-meta">{assessed ? "Context" : "Unassessed"}</p>}
    {finding?.finding.limitation && <p className="evidence-source-limit"><strong>Limit:</strong> {finding.finding.limitation}</p>}
    <div className="evidence-quote-actions">
      {choose && <button type="button" className="workspace-secondary" onClick={choose}>Use this quote</button>}
      <Excerpt source={source} />
    </div>
  </article>;
}

function SourceList({ sources, groups, numbers, topic, onSave, onPractice }: CardActions & {
  sources: Source[]; groups: React.ReactNode; numbers: Map<string, number>;
}) {
  const [editing, setEditing] = useState<Source | null>(null);
  const [saved, setSaved] = useState("");
  const trigger = useRef<HTMLButtonElement | null>(null);
  const hasActions = Boolean(topic && onSave && onPractice);
  const featured = sources.filter(source => source.quote).slice(0, 3);
  function choose(source: Source, button: HTMLButtonElement | null) {
    trigger.current = button;
    setSaved("");
    setEditing(source);
  }
  function close() {
    setEditing(null);
    requestAnimationFrame(() => trigger.current?.focus());
  }
  return <>
    {editing && topic && onSave && onPractice && <EvidenceCardEditor key={editing.page.passage.id} page={editing.page}
      topic={topic} prefill={editing.quote} onPractice={onPractice}
      onSave={card => { onSave(card); setSaved("Quote saved for later."); close(); }} onCancel={close} />}
    {saved && <p className="workspace-note" role="status">{saved}</p>}
    <div hidden={Boolean(editing)}>
    {featured.length ? <section className="research-section evidence-featured">
      <h3>Quotes to start with</h3>
      <div className="evidence-featured-grid">{featured.map(source => {
        const direction = source.finding?.recordId && source.finding.finding.match === "direct"
          && source.finding.finding.strength !== "weak" ? source.finding.finding.stance : undefined;
        return <FeaturedSource key={source.page.passage.id} source={source}
          direction={direction === "supports" || direction === "contradicts" ? direction : undefined}
          choose={hasActions ? event => choose(source, event.currentTarget) : undefined} />;
      })}</div>
    </section> : <p className="workspace-note">No usable excerpts came back. Try narrowing the motion or checking a specific claim.</p>}
    {groups}
    {sources.length > 0 && <aside className="research-sources" aria-labelledby="research-sources-title">
      <h3 id="research-sources-title">All sources · {sources.length}</h3>
      <ol>{[...sources].sort((a, b) => numbers.get(a.page.id)! - numbers.get(b.page.id)!).map(source => {
        const { page, assessed } = source;
        const number = numbers.get(page.id)!;
        return <li key={page.passage.id} id={`evidence-source-${number}`}>
          <span className="research-source-number">[{number}]</span>
          {source.quote ? <SourceQuotation page={page} quote={source.quote} /> : <>
            <h4>{page.paper?.title ?? page.title}</h4>
            <PaperDetails page={page} />
            {!page.paper && page.author && <p className="workspace-meta">By {page.author}</p>}
            <p className="research-source-status">{sourceType(page)}</p>
            <OriginalPage page={page} />
          </>}
          {page.passage.text && <p className="research-source-status">{!assessed ? "Unassessed"
            : !source.finding?.recordId ? "Independence unverified" : null}</p>}
          {source.finding?.finding.limitation && <p className="evidence-source-limit"><strong>Limit:</strong> {source.finding.finding.limitation}</p>}
          {source.summary && source.summaryQuote && <details className="research-passage">
            <summary>{page.passage.scope === "abstract" ? "Abstract summary" : "Article summary"}</summary>
            <p>{source.summary}</p>
            <blockquote>{source.summaryQuote}</blockquote>
          </details>}
          {source.quote && page.paper && page.paper.authors.length > 4 && <details className="research-passage">
            <summary>View all authors</summary>
            <p className="workspace-meta">{page.paper.authors.join(", ")}</p>
          </details>}
          <div className="evidence-quote-actions">
            {hasActions && source.quote && <button type="button" className="workspace-secondary"
              onClick={event => choose(source, event.currentTarget)}>Use this quote</button>}
            <PaperRecord page={page} />
            {page.passage.text && <Excerpt source={source} />}
          </div>
        </li>;
      })}</ol>
    </aside>}
    </div>
  </>;
}

export default function EvidenceResults({ result, retry, retrying, canRetry, topic, mode = "claim", onSave, onPractice }: CardActions & {
  result: Investigation;
  retry: () => void;
  retrying: boolean;
  canRetry: boolean;
  mode?: "claim" | "motion";
}) {
  const { snapshot } = result;
  const numbers = new Map(snapshot.pages.map((page, index) => [page.id, index + 1]));
  const review = result.state === "complete" ? result.review : null;
  const supporting = [...new Set(review?.targets.flatMap(target => target.supporting))];
  const challenging = [...new Set(review?.targets.flatMap(target => target.challenging))];
  const directional = new Set([...supporting, ...challenging]);
  const context = review?.findings.filter(finding => !directional.has(finding)) ?? [];
  const assessments = new Map(result.state === "complete" ? result.assessments.map(entry => [entry.id, entry]) : []);
  const pendingChecks = result.state === "complete" ? snapshot.selected.filter(page => !assessments.has(page.id)) : [];
  const pendingAbstractsNeedUpdate = snapshot.paperAssessmentNeedsUpdate
    && pendingChecks.some(page => page.passage.scope === "abstract");
  const sources = snapshot.pages.map((page): Source => {
    const assessment = assessments.get(page.id);
    const finding = [...directional, ...context].find(entry => entry.page.passage.id === page.passage.id);
    return { page, finding, summary: assessment?.articleSummary?.text, summaryQuote: assessment?.articleSummary?.quote,
      quote: suggestEvidenceQuote(page, finding?.finding.quote ?? assessment?.articleSummary?.quote), assessed: Boolean(assessment) };
  });
  const byId = new Map(sources.map(source => [source.page.id, source]));
  const featuredOrder = [...new Set([
    supporting[0]?.page.id, challenging[0]?.page.id, ...supporting.map(item => item.page.id), ...challenging.map(item => item.page.id),
    ...context.map(item => item.page.id), ...sources.filter(source => source.summary).map(source => source.page.id),
    ...snapshot.selected.map(page => page.id), ...sources.map(source => source.page.id),
  ].filter(id => id !== undefined))];
  const paperSearchFailed = snapshot.searches.some(search => search.provider === "openalex" && search.state === "failed");
  const webSearchFailures = [...new Set(snapshot.searches.filter(search => search.provider !== "openalex" && search.state === "failed")
    .map(search => search.direction))];
  const searchLimited = snapshot.searches.some(search => search.state === "limited");
  const hasWebSources = snapshot.pages.some(page => page.passage.scope === "retrieved excerpt");
  const empty = snapshot.searches.filter(search => search.state === "empty");
  const title = result.state === "unavailable" ? "Source analysis unavailable"
    : result.state === "empty" ? "No sources found" : result.state === "search-failed" ? "Evidence search failed" : "Source analysis";
  const Icon = review ? Search : CircleAlert;
  return <section className="research-results" aria-label="Research results">
    <header className="research-conclusion" data-outcome="uncertain">
      <div className="research-verdict-heading">
        <span className="research-verdict-icon"><Icon size={23} aria-hidden="true" /></span>
        <h2>{title}</h2>
      </div>
      <blockquote>{snapshot.claim}</blockquote>
      <dl className="evidence-coverage" aria-label="Research coverage"><div><dt>Sources retrieved</dt><dd>{snapshot.pages.length}</dd></div><div><dt>Selected excerpts checked</dt><dd>{snapshot.selected.filter(page => assessments.has(page.id)).length} <span>of {snapshot.selected.length}</span></dd></div><div><dt>Abstracts retrieved</dt><dd>{snapshot.pages.filter(page => page.passage.scope === "abstract").length}</dd></div></dl>
      <p className="evidence-coverage-explanation">Retrieval finds material. Assessment checks an excerpt; it does not certify a source or establish that a claim is true.</p>
      {result.state !== "complete" && <p className="workspace-meta">{result.reason}</p>}
      {result.state === "unavailable" && (canRetry
        ? <button type="button" className="workspace-secondary" onClick={retry} disabled={retrying}>{retrying ? "Reading excerpts…" : "Retry reading excerpts"}</button>
        : <p className="workspace-meta">Start a new search to retry source analysis.</p>)}
      {pendingChecks.length > 0 && <>
        <p className="research-coverage-note"><strong>Some excerpts couldn’t be checked.</strong>{" "}
          {pendingAbstractsNeedUpdate
            ? "The assessment service needs an update to check research abstracts. You can still read and quote them below."
            : "You can use the completed findings and read the other sources below."}</p>
        {canRetry && <button type="button" className="workspace-secondary" onClick={retry} disabled={retrying}>
          {retrying ? "Reading excerpts…" : "Retry remaining excerpts"}
        </button>}
      </>}
      {paperSearchFailed && <p className="research-coverage-note"><strong>Research paper search unavailable.</strong>{" "}
        {hasWebSources ? "You can still read and use the web sources below." : "See Search activity for details."}</p>}
      {webSearchFailures.length > 0 && <p className="research-coverage-note"><strong>Web searches unavailable</strong> · {webSearchFailures.join(", ")}.</p>}
      {searchLimited && result.state !== "search-failed" && <p className="research-coverage-note"><strong>Evidence Lab reached its search limit.</strong>{" "}
        See Search activity for which queries ran.</p>}
      {empty.length > 0 && <p className="workspace-meta">Searches that returned no sources · {empty.map(search => search.direction).join(", ")}</p>}
    </header>
    <SourceList sources={featuredOrder.flatMap(id => byId.get(id) ?? [])} numbers={numbers} topic={topic} onSave={onSave} onPractice={onPractice}
      groups={review && (mode === "motion"
        ? <section className="research-section">
          <h3>Factual questions behind the motion</h3>
          {review.targets.filter(({ target }) => target.outcome && target.text !== snapshot.claim).map(({ target, supporting: forTarget, challenging: againstTarget }) => {
            const related = context.filter(item => item.finding.targetId === target.id);
            return <details className="research-passage" key={target.id}>
              <summary>{target.text}</summary>
              <div>
                {forTarget.length > 0 && <><h4>Supporting findings</h4><FindingList findings={forTarget} numbers={numbers} /></>}
                {againstTarget.length > 0 && <><h4>Challenging findings</h4><FindingList findings={againstTarget} numbers={numbers} /></>}
                {related.length > 0 && <><h4>Context and limitations</h4><FindingList findings={related} numbers={numbers} /></>}
                {!forTarget.length && !againstTarget.length && <p className="workspace-meta">No direct finding could be checked for this question.</p>}
              </div>
            </details>;
          })}
          {!review.targets.some(({ target }) => target.outcome && target.text !== snapshot.claim) && <p className="workspace-meta">Specific research questions were unavailable. Browse the sources below or check a narrower claim.</p>}
          {result.state === "complete" && result.caveats.length > 0 && <details className="research-passage"><summary>Search limitations</summary>
            <div><ul>{result.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul></div>
          </details>}
        </section>
        : <AnalysisGroups result={result} review={review} numbers={numbers} supporting={supporting} challenging={challenging} context={context} />)} />
  </section>;
}

function AnalysisGroups({ result, review, numbers, supporting, challenging, context }: {
  result: Investigation;
  review: Extract<Investigation, { state: "complete" }>["review"];
  numbers: Map<string, number>;
  supporting: CitedFinding[];
  challenging: CitedFinding[];
  context: CitedFinding[];
}) {
  return <>
    <div className="research-evidence-grid evidence-analysis-grid">
      <section className="research-evidence-side" data-stance="supports">
        <header className="research-evidence-heading"><Check size={19} aria-hidden="true" /><h3>Supports the claim</h3></header>
        {supporting.length ? <FindingList findings={supporting} numbers={numbers} /> : <p className="workspace-meta">No direct supporting finding from an independently verified record.</p>}
      </section>
      <section className="research-evidence-side" data-stance="contradicts">
        <header className="research-evidence-heading"><ArrowDownRight size={19} aria-hidden="true" /><h3>Challenges the claim</h3></header>
        {challenging.length ? <FindingList findings={challenging} numbers={numbers} /> : <p className="workspace-meta">No direct challenging finding from an independently verified record.</p>}
      </section>
    </div>
    <section className="research-section">
      <h3>Context and limitations</h3>
      {result.snapshot.plan.policy && <p className="workspace-meta">The findings address factual premises and trade-offs in this motion.</p>}
      {review.conflictingRecords.length > 0 && <p className="workspace-meta">Different findings within one record. Compare their quotes and scope.</p>}
      {review.targets.filter(target => !target.supporting.length && !target.challenging.length).map(({ target }) =>
        <p className="workspace-meta" key={target.id}>Limited direct evidence · {target.text}</p>)}
      {context.length > 0 && <FindingList findings={context} numbers={numbers} />}
      {result.state === "complete" && result.caveats.length > 0 && <ul>{result.caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul>}
      {review.records.length > 0 && <details className="research-passage">
        <summary>Independent records · {review.independentCount}</summary>
        <ul>{review.records.map(record => <li key={record.id}>
          <p>{record.primary.page.paper?.title ?? record.primary.page.title}</p>
          <p className="workspace-meta">{record.primary.finding.record?.type} · {record.pages.length} linked {record.pages.length === 1 ? "page" : "pages"}</p>
          <OriginalPage page={record.primary.page} />
        </li>)}</ul>
      </details>}
    </section>
  </>;
}
