import ArgumentMaps from "./ArgumentMaps";
import { cardCitation, cardsAsRis, filterCards, parseTags, readCardTags } from "../lib/evidence-library";
import { downloadFile, downloadJson } from "../lib/download";
import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, Search } from "lucide-react";
import { auth } from "../lib/supabase";
import { invokeVeritasFunction } from "../lib/supabase-functions";
import {
  canRetryAssessment,
  createInvestigationRun,
  retryAssessment,
  runInvestigation,
} from "../lib/evidence-investigation.ts";
import type { AssessmentResult, Investigation, TraceStep } from "../lib/evidence-investigation.ts";
import type { View } from "../components/AppShell";
import EvidenceResults from "./EvidenceResults";
import { EvidenceCardDetails } from "./EvidenceCard";
import { readResearchTopic } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import type { EvidenceCard, ResearchTopic } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import { readEvidenceCards, saveEvidenceCards } from "../lib/evidence-cards";

const MAX_AGENT_STEPS = 16;

function InvestigationTimeline({ steps, busy, interrupted }: {
  steps: TraceStep[];
  busy: boolean;
  interrupted: boolean;
}) {
  return <ol className="research-timeline" aria-label="Search and review steps">
    {steps.map((step, index) => {
      const isLast = index === steps.length - 1;
      const state = isLast && busy ? "running" : isLast && interrupted ? "interrupted" : "finished";
      const Icon = state === "running" ? LoaderCircle : state === "interrupted" ? CircleAlert : Check;
      return <li key={`${index}:${step.title}`} className="research-step" data-state={state} aria-current={state === "running" ? "step" : undefined}>
        <span className="research-step-marker"><Icon size={15} aria-hidden="true" /></span>
        <div className="research-step-body">
          <div className="research-step-heading">
            <strong>{step.title}</strong>
            <span>{state === "running" ? "Running" : state === "interrupted" ? "Interrupted" : "Finished"}</span>
          </div>
          {step.notes.length > 0 && <ul className="research-step-notes">
            {step.notes.map((note, noteIndex) => <li key={noteIndex}>{note}</li>)}
          </ul>}
        </div>
      </li>;
    })}
  </ol>;
}

export default function EvidenceLab({ accountId, sessionEmail, onSignIn, onNavigate, onPractice, onResumePractice, onPrepareDebate }: {
  accountId: string | null;
  sessionEmail: string | null;
  onSignIn: () => void;
  onNavigate: (view: View) => void;
  onPractice: (card: EvidenceCard) => void;
  onResumePractice?: () => void;
  onPrepareDebate?: (motion: string, outline: string) => void;
}) {
  const draftKey = `veritas:evidence-topic:v1:${accountId ?? "guest"}`;
  const [draft, setDraft] = useState<ResearchTopic>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? (accountId ? sessionStorage.getItem("veritas:evidence-topic:v1:guest") : null) ?? "null");
      if (saved && typeof saved.motion === "string" && typeof saved.claim === "string") {
        return { motion: saved.motion.slice(0, 200), claim: saved.claim.slice(0, 500) };
      }
      const oldClaim = sessionStorage.getItem(`veritas:evidence-draft:${sessionEmail ?? "guest"}`);
      return { motion: "", claim: oldClaim?.slice(0, 500) ?? "" };
    } catch { /* The draft can be used in memory. */ }
    return { motion: "", claim: "" };
  });
  const [claimOpen, setClaimOpen] = useState(Boolean(draft.claim.trim()));
  const [submitted, setSubmitted] = useState<{ topic: ResearchTopic; mode: "claim" | "motion" }>();
  const [cards, setCards] = useState(() => {
    try { return accountId ? readEvidenceCards(localStorage, accountId).length ? readEvidenceCards(localStorage, accountId) : readEvidenceCards(sessionStorage, accountId) : []; }
    catch { return []; }
  });
  const tagsKey = `veritas:evidence-tags:v1:${accountId ?? "guest"}`;
  const [tags, setTags] = useState(() => { try { return readCardTags(localStorage.getItem(tagsKey)); } catch { return {}; } });
  const [cardQuery, setCardQuery] = useState("");
  const [cardType, setCardType] = useState("all");
  const [libraryStatus, setLibraryStatus] = useState("");
  const filteredCards = filterCards(cards, cardQuery, tags, cardType);
  const [result, setResult] = useState<Investigation | null>(null);
  const [busy, setBusy] = useState<"search" | "retry" | null>(null);
  const [slow, setSlow] = useState(false);
  const [traceOpen, setTraceOpen] = useState(false);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [traceRun, setTraceRun] = useState(0);
  const [error, setError] = useState("");
  const run = useRef(createInvestigationRun());

  useEffect(() => {
    const currentRun = run.current;
    return () => currentRun.cancel();
  }, []);

  useEffect(() => {
    setSlow(false);
    if (!busy) return;
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [busy]);

  function updateDraft(change: Partial<ResearchTopic>) {
    const next = { ...draft, ...change };
    setDraft(next);
    setError("");
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      // The draft stays in memory when browser storage is unavailable.
    }
  }

  function saveCard(card: EvidenceCard) {
    if (!accountId) return;
    const next = [card, ...cards.filter(item => item.id !== card.id)];
    try { saveEvidenceCards(localStorage, accountId, next); }
    catch { setError("Your quote is available for this visit, but could not be saved on this device. Export your library to keep a copy."); }
    setCards(next);
  }

  async function execute(selection: NonNullable<typeof submitted>, previous?: AssessmentResult) {
    const { topic, mode } = selection;
    const type = previous ? "retry" : "search";
    const controller = run.current.begin(type);
    if (!controller) return;
    setBusy(type);
    setError("");
    if (!previous) setTraceOpen(false);
    if (type === "search") {
      setSubmitted(selection);
      setResult(null);
      setTraceRun(value => value + 1);
      setTrace([]);
    }
    const log = (step: TraceStep) => {
      if (!run.current.current(controller)) return;
      setTrace(current => [...current.slice(0, MAX_AGENT_STEPS - 1), step]);
    };
    try {
      const completed = previous
        ? await retryAssessment(previous, invokeVeritasFunction, controller.signal, log)
        : await runInvestigation(topic.claim, invokeVeritasFunction, controller.signal, log, mode);
      if (!run.current.current(controller)) return;
      setResult(completed);
      if (completed.state === "complete" && type === "search") setTraceOpen(false);
    } catch (cause) {
      if (run.current.current(controller)) setError(cause instanceof Error ? cause.message : "The investigation could not be completed.");
    } finally {
      if (run.current.current(controller)) {
        setBusy(null);
        run.current.finish(controller);
      }
    }
  }

  function investigate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy === "search" || !auth || !accountId) return;
    if (!navigator.onLine) { setError("You’re offline. Reconnect to search for sources."); return; }
    const claim = claimOpen ? draft.claim.trim() : "";
    const topic = readResearchTopic({ motion: draft.motion, claim: claim || draft.motion.trim() });
    if (!topic) { setError("Enter at least 8 characters for the motion and for any specific claim."); return; }
    void execute({ topic, mode: claim ? "claim" : "motion" });
  }

  function retry() {
    if (!result || (result.state !== "unavailable" && result.state !== "complete")
      || !canRetryAssessment(result) || !submitted || busy || !auth || !accountId) return;
    if (!navigator.onLine) { setError("You’re offline. Reconnect to retry the assessment."); return; }
    void execute(submitted, result);
  }

  const phase = trace.filter(step => step.phase).at(-1)?.phase;
  const interrupted = !busy && (Boolean(error) || result?.state === "unavailable" || result?.state === "search-failed");
  const partialSearch = result?.snapshot.searches.some(search => search.state === "failed" || search.state === "limited");
  const partialAssessment = result?.state === "complete"
    && result.snapshot.selected.some(page => !result.assessments.some(entry => entry.id === page.id));
  const hasTrace = trace.length > 0;
  const complete = !busy && result?.state === "complete";
  const phaseIndex = complete ? 4
    : busy === "retry" || result?.state === "unavailable" || phase === "Reading excerpts" ? 2
      : phase === "Finding sources" || result ? 1
        : submitted ? 0 : -1;
  return <section className="workspace-flow research-workspace">
    <h1 className="workspace-page-title">Evidence Lab</h1>
    <p className="workspace-lead">Find a source and practise using it in an argument.</p>
    {onResumePractice && <button type="button" className="workspace-secondary evidence-resume" onClick={onResumePractice}>Resume quote practice</button>}
    <form className="research-form" onSubmit={investigate}>
      <label className="workspace-field">What are you debating?
        <input required maxLength={200} value={draft.motion} onChange={event => updateDraft({ motion: event.target.value })}
          placeholder="Cities should invest more in urban tree cover" />
      </label>
      <details className="research-passage" open={claimOpen} onToggle={event => setClaimOpen(event.currentTarget.open)}>
        <summary>Check a specific claim</summary>
        <div><label className="workspace-field">Specific factual claim (optional)
          <textarea rows={2} value={draft.claim} onChange={event => updateDraft({ claim: event.target.value })} maxLength={500}
            placeholder="More urban trees reduce heat-related illness during summer." />
        </label></div>
      </details>
      <div className="research-form-actions">
        {busy && <button type="button" className="workspace-secondary" onClick={() => {
          run.current.cancel(); setBusy(null); setError("Investigation cancelled. Your input and search activity are preserved; you can start again.");
        }}>Cancel investigation</button>}
        <button type="submit" className="workspace-primary" disabled={Boolean(busy) || !auth || !accountId || draft.motion.trim().length < 8}>
          {busy === "search" ? <LoaderCircle className="spinner" size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
          Find sources
        </button>
      </div>
    </form>
    {(!auth || !accountId) && <div className="workspace-note">
      <strong>{auth ? "Account required" : "Research service unavailable"}</strong>
      <p>{auth ? "Sign in to run searches and compare source findings." : "Search and AI assessment require a connected backend."}</p>
      <button className="workspace-text-action" onClick={auth ? onSignIn : () => onNavigate("study")}>{auth ? "Go to sign in" : "Study how to assess evidence"}</button>
    </div>}
    {phaseIndex >= 0 && <ol className="research-phase-map" aria-label="Investigation progress">
      {["Plan the search", "Find sources", "Read excerpts", "Compare evidence", "Show findings"].map((label, index) => {
        const state = complete || index < phaseIndex ? "complete" : index > phaseIndex ? "pending"
          : interrupted ? "interrupted" : result?.state === "empty" ? "complete" : "active";
        return <li key={label} data-state={state} aria-current={state === "active" ? "step" : undefined}>
          <span aria-hidden="true">{index + 1}</span><strong aria-label={`${label}, ${state}`}>{label}</strong>
        </li>;
      })}
    </ol>}
    {cards.length > 0 && <section className="research-section evidence-saved-cards" id="saved-evidence-cards">
      <h2>Saved evidence cards</h2>
      <p className="workspace-meta">Saved on this device. Quotations retain their source and excerpt type when exported.</p>
      <label className="workspace-field">Search saved quotes<input value={cardQuery} onChange={event => setCardQuery(event.target.value)} placeholder="Topic, author, quotation or tag" /></label>
      <label className="workspace-field">Source text<select value={cardType} onChange={event => setCardType(event.target.value)}><option value="all">All excerpts</option><option value="abstract">Paper abstracts</option><option value="retrieved excerpt">Web excerpts</option></select></label>
      <p role="status">{filteredCards.length} of {cards.length} saved quotes</p>
      <div className="argument-point-actions"><button className="workspace-secondary" disabled={!filteredCards.length} onClick={() => downloadFile("veritas-citations.txt", filteredCards.map(cardCitation).join("\n\n"))}>Export citations and quotes</button>
      <button className="workspace-secondary" disabled={!filteredCards.length} onClick={() => downloadFile("veritas-citations.ris", cardsAsRis(filteredCards), "application/x-research-info-systems")}>Export RIS citations</button>
      <button className="workspace-secondary" onClick={() => downloadJson("veritas-evidence-cards.json", { cards: filteredCards, tags: Object.fromEntries(filteredCards.map(card => [card.id, tags[card.id] ?? []])) })}>Export cards JSON</button></div>
      {filteredCards.map(card => <details className="research-passage" key={card.id}>
        <summary>{card.title}</summary>
        <p className="workspace-meta">{card.motion}</p>
        <EvidenceCardDetails card={card} />
        <label className="workspace-field">Tags (comma separated)<input maxLength={320} defaultValue={(tags[card.id] ?? []).join(", ")} onBlur={event => {
          const next = { ...tags, [card.id]: parseTags(event.target.value) }; setTags(next);
          try { localStorage.setItem(tagsKey, JSON.stringify(next)); setLibraryStatus("Tags saved on this device."); } catch { setLibraryStatus("Tags are available for this visit; device storage is unavailable."); }
        }} /></label>
        <button type="button" className="workspace-secondary" onClick={() => onPractice(card)}>Practice with this quote</button>
        <button type="button" className="workspace-text-action" onClick={() => {
          if (!window.confirm("Remove this saved quote from this device? Copies attached to argument maps and exported files remain separate.")) return;
          const next = cards.filter(item => item.id !== card.id);
          try { saveEvidenceCards(localStorage, accountId!, next); setCards(next); setLibraryStatus("Saved quote removed."); }
          catch { setLibraryStatus("Could not remove the quote from device storage."); }
        }}>Remove saved quote</button>
      </details>)}
      {libraryStatus && <p role="status">{libraryStatus}</p>}
    </section>}
    <ArgumentMaps key={accountId ?? "guest"} owner={accountId ?? "guest"} cards={cards} motion={draft.motion} onDebate={onPrepareDebate} />
    <p className="research-phase workspace-meta" role="status">
      {busy ? `${phase ?? "Finding sources"}${slow ? " · This is taking longer than usual." : ""}` : ""}
    </p>
    {hasTrace && <details className="research-trace" key={traceRun} open={traceOpen} onToggle={event => setTraceOpen(event.currentTarget.open)}>
      <summary>Search activity <span>{busy ? "In progress" : interrupted ? "Interrupted" : partialSearch || partialAssessment ? "Partial coverage" : "Complete"}</span></summary>
      <div className="research-trace-content">
        <InvestigationTimeline steps={trace} busy={Boolean(busy)} interrupted={interrupted} />
      </div>
    </details>}
    {error && <p className="workspace-error" role="alert">{error} Your search input is still available above.</p>}
    {result && <EvidenceResults result={result} retry={retry} retrying={busy === "retry"} canRetry={canRetryAssessment(result)}
      topic={submitted?.topic} mode={submitted?.mode} onSave={saveCard} onPractice={onPractice} />}
  </section>;
}
