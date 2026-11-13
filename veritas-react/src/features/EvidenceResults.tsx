import { ArrowDownRight, ArrowUpRight, Check, CircleAlert, CircleHelp, Scale } from "lucide-react";
import { safeSourceUrl } from "../../../app/supabase/functions/_shared/evidence-verification.ts";
import type { Page } from "../../../app/supabase/functions/_shared/evidence-verification.ts";
import type { CitedFinding, Investigation } from "../lib/evidence-investigation.ts";

const outcomes = {
  supported: { label: "Supported by retrieved evidence", tone: "supports", icon: Check },
  refuted: { label: "Refuted by retrieved evidence", tone: "contradicts", icon: ArrowDownRight },
  mixed: { label: "Mixed evidence", tone: "mixed", icon: Scale },
  insufficient: { label: "Insufficient evidence", tone: "uncertain", icon: CircleHelp },
};

const targetLabels = {
  supported: "Supported",
  refuted: "Challenged",
  mixed: "Mixed",
  insufficient: "Unresolved",
};

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
    <summary>{page.passage.scope === "abstract" ? "Inspect abstract excerpt" : "Inspect passage"} [{number}] · {page.paper?.title ?? page.title}</summary>
    <PaperDetails page={page} />
    <p className="workspace-meta">
      {page.passage.scope === "abstract" ? "Abstract excerpt" : page.paper ? "Retrieved web excerpt" : "Retrieved excerpt"}
      {!page.paper && ` · ${dateLabel(page.date)}`} · {recordId && finding.record ? finding.record.type : "Source type or independence unverified"}
    </p>
    <blockquote>{finding.quote}</blockquote>
    {finding.limitation && <p className="workspace-meta">Limit: {finding.limitation}</p>}
    <OriginalPage page={page} />
    <PaperRecord page={page} />
    {recordUrl && finding.record?.relation === "secondary" && <a className="workspace-text-action"
      href={recordUrl.href} target="_blank" rel="noopener noreferrer">Open underlying record <ArrowUpRight size={15} aria-hidden="true" /></a>}
  </details>;
}

function FindingList({ findings, numbers }: { findings: CitedFinding[]; numbers: Map<string, number> }) {
  return <ul className="research-verification-findings">
    {findings.map((item, index) => <li key={`${item.page.passage.id}:${item.finding.targetId}:${index}`}>
      <p className="workspace-meta">Checked proposition · {item.targetText}</p>
      <p><span className="workspace-meta">AI interpretation · </span>{item.finding.interpretation}</p>
      <p className="workspace-meta">{item.finding.match === "direct" ? "Direct" : "Indirect"} · {item.finding.strength} finding{!item.recordId ? " · independence unverified" : ""}</p>
      <Citation item={item} number={numbers.get(item.page.id)!} />
    </li>)}
  </ul>;
}

function SourceList({ result, numbers }: { result: Investigation; numbers: Map<string, number> }) {
  return <aside className="research-sources" aria-labelledby="research-sources-title">
    <h3 id="research-sources-title">Retrieved sources · {result.snapshot.pages.length}</h3>
    <p className="workspace-meta">The review uses saved web and abstract excerpts. Open the linked sources to check the full context.</p>
    <ol>{result.snapshot.pages.map(page => {
      const assessment = result.state === "complete" ? result.assessments.find(entry => entry.id === page.id) : undefined;
      const findings = result.state === "complete" ? result.review.findings.filter(entry => entry.page.id === page.id) : [];
      const verified = findings.find(entry => entry.recordId && entry.finding.record);
      const number = numbers.get(page.id)!;
      const isAbstract = page.passage.scope === "abstract";
      const metadataOnly = page.passage.scope === "metadata only";
      const label = metadataOnly ? "Metadata only · no usable abstract was retrieved"
        : !assessment ? "Unassessed" : verified ? `Linked to ${verified.finding.record?.type}` : "Independence unverified";
      return <li key={page.id}>
        <span className="research-source-number">[{number}]</span>
        <h4>{page.paper?.title ?? page.title}</h4>
        <PaperDetails page={page} />
        {page.paper ? <p className="workspace-meta">{isAbstract ? "Abstract excerpt" : metadataOnly ? "Paper record" : "Retrieved web excerpt"}</p>
          : <>
            <p className="workspace-meta">{safeSourceUrl(page.url)?.hostname} · {dateLabel(page.date)}</p>
            {page.author && <p className="workspace-meta">By {page.author}</p>}
          </>}
        <p className="research-source-status">{label}</p>
        {assessment && <div className="research-article-summary">
          <strong>{isAbstract ? "Abstract summary" : "Article summary"}</strong>
          {assessment.articleSummary ? <>
            <p>{assessment.articleSummary.text}</p>
            <details className="research-passage">
              <summary>{isAbstract ? "Read the abstract passage behind this summary" : "Read the passage behind this summary"}</summary>
              <blockquote>{assessment.articleSummary.quote}</blockquote>
            </details>
          </> : <p className="workspace-meta">A summary could not be verified from the retrieved excerpt.</p>}
        </div>}
        <OriginalPage page={page} />
        <PaperRecord page={page} />
        {page.passage.text && <details className="research-passage">
          <summary>{isAbstract ? "Read the saved abstract excerpt" : "Full retrieved excerpt"}</summary>
          <blockquote>{page.passage.text}</blockquote>
        </details>}
        {findings.length > 0 && <details className="research-passage">
          <summary>Validated findings from this page</summary>
          <FindingList findings={findings} numbers={numbers} />
        </details>}
      </li>;
    })}</ol>
  </aside>;
}

export default function EvidenceResults({ result, retry, retrying, canRetry }: {
  result: Investigation;
  retry: () => void;
  retrying: boolean;
  canRetry: boolean;
}) {
  const { snapshot } = result;
  const numbers = new Map(snapshot.pages.map((page, index) => [page.id, index + 1]));
  if (result.state !== "complete") {
    const title = result.state === "unavailable" ? "Assessment unavailable"
      : result.state === "empty" ? "No sources found" : "Evidence search failed";
    return <section className="research-results" aria-label="Investigation results">
      <header className="research-conclusion" data-outcome="uncertain">
        <div className="research-verdict-heading">
          <span className="research-verdict-icon"><CircleAlert size={23} aria-hidden="true" /></span>
          <h2>{title}</h2>
        </div>
        <blockquote>{snapshot.claim}</blockquote>
        {result.state === "unavailable" && <p>Sources were found, but the assessment could not be completed. You can still read the excerpts and open the original pages.</p>}
        <p className="workspace-meta">{result.reason}</p>
        {result.state === "unavailable" && (canRetry ? <button type="button" className="workspace-primary"
          onClick={retry} disabled={retrying}>{retrying ? "Retrying assessment…" : "Retry assessment"}</button>
          : <p className="workspace-meta">The assessment limit was reached. Start a new investigation to try again.</p>)}
      </header>
      {snapshot.pages.length > 0 && <SourceList result={result} numbers={numbers} />}
    </section>;
  }

  const { review, caveats } = result;
  const { tone, label, icon: Icon } = outcomes[review.status];
  const supporting = [...new Set(review.targets.flatMap(target => target.supporting))];
  const challenging = [...new Set(review.targets.flatMap(target => target.challenging))];
  return <section className="research-results" aria-label="Investigation results">
    <header className="research-conclusion" data-outcome={tone}>
      <div className="research-verdict-heading">
        <span className="research-verdict-icon"><Icon size={23} aria-hidden="true" /></span>
        <div>
          <p className="workspace-caption">{snapshot.plan.policy ? "Factual evidence and trade-offs" : "Verdict from retrieved evidence"}</p>
          <h2>{snapshot.plan.policy ? "Policy evidence review" : label}</h2>
        </div>
      </div>
      <blockquote>{snapshot.claim}</blockquote>
      <p className="research-verdict-context">{review.reason}</p>
      {caveats.length > 0 && <p className="research-coverage-note"><strong>Partial coverage</strong> · {caveats[0]}</p>}
    </header>

    <div className="research-breakdown">
      <dl aria-label="Source and record counts">
        <div><dt>Retrieved sources</dt><dd>{snapshot.pages.length}</dd></div>
        <div><dt>Independent records identified</dt><dd>{review.independentCount}</dd></div>
        <div><dt>Records that contributed</dt><dd>{review.weightedCount}</dd></div>
      </dl>
      <p className="workspace-meta">One underlying record counts once, even when several pages report it. Only direct, credible findings contribute.</p>
      {review.records.length > 0 && <details className="research-passage">
        <summary>See independent records</summary>
        <ul>{review.records.map(record => <li key={record.id}>
          <strong>{record.primary.page.paper?.title ?? record.primary.page.title}</strong>
          <PaperDetails page={record.primary.page} />
          <p className="workspace-meta">{record.primary.finding.record?.type} · {record.pages.length} linked {record.pages.length === 1 ? "page" : "pages"} · {record.contributes ? "Contributed" : "Did not contribute"}</p>
          <OriginalPage page={record.primary.page} />
        </li>)}</ul>
      </details>}
    </div>

    <section className="research-section">
      <h3>{snapshot.plan.policy ? "Factual premises and trade-offs" : "Propositions checked"}</h3>
      <ul className="research-targets">{review.targets.map(({ target, status }) => <li key={target.id}
        data-stance={status === "supported" ? "supports" : status === "refuted" ? "contradicts" : undefined}>
        <strong>{targetLabels[status]}</strong> · {target.text}
        {target.qualifiers.length > 0 && <p className="workspace-meta">{target.qualifiers.map(qualifier => `${qualifier.kind}: ${qualifier.text}`).join(" · ")}</p>}
      </li>)}</ul>
    </section>

    {review.summary.length > 0 && <section className="research-section">
      <h3>What the passages establish</h3>
      <FindingList findings={review.summary} numbers={numbers} />
    </section>}

    <section className="research-section">
      <h3>Compare direct findings</h3>
      <div className="research-evidence-grid">
        <section className="research-evidence-side" data-stance="supports">
          <header className="research-evidence-heading"><Check size={19} aria-hidden="true" /><h4>Supporting findings</h4></header>
          {supporting.length ? <FindingList findings={supporting} numbers={numbers} /> : <p className="workspace-meta">No independently verified supporting finding was retained.</p>}
        </section>
        <section className="research-evidence-side" data-stance="contradicts">
          <header className="research-evidence-heading"><ArrowDownRight size={19} aria-hidden="true" /><h4>Challenging findings</h4></header>
          {challenging.length ? <FindingList findings={challenging} numbers={numbers} /> : <p className="workspace-meta">No independently verified challenging finding was retained.</p>}
        </section>
      </div>
      {review.conflictingRecords.map((findings, index) => <section key={index} className="research-record-conflict">
        <h4>Different findings within one record</h4>
        <FindingList findings={findings} numbers={numbers} />
      </section>)}
    </section>

    {caveats.length > 0 && <section className="research-section">
      <h3>Search and evidence limits</h3>
      <ul>{caveats.map(caveat => <li key={caveat}>{caveat}</li>)}</ul>
    </section>}
    <SourceList result={result} numbers={numbers} />
  </section>;
}
