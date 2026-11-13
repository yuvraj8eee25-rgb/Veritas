import { useEffect, useRef, useState } from "react";
import { Check, CircleAlert, LoaderCircle, Search } from "lucide-react";
import { auth } from "../lib/supabase";
import { invokeVeritasFunction } from "../lib/supabase-functions";
import {
  createInvestigationRun,
  MAX_ASSESSMENT_CALLS,
  retryAssessment,
  runInvestigation,
} from "../lib/evidence-investigation.ts";
import type { Investigation, TraceStep } from "../lib/evidence-investigation.ts";
import type { View } from "../components/AppShell";
import EvidenceResults from "./EvidenceResults";
import { EvidenceCardDetails } from "./EvidenceCard";
import { readResearchTopic } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import type { EvidenceCard, ResearchTopic } from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import { readEvidenceCards, saveEvidenceCards } from "../lib/evidence-cards";

const MAX_AGENT_STEPS = 10;

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

export default function EvidenceLab({ accountId, sessionEmail, onSignIn, onNavigate, onPractice, onResumePractice }: {
  accountId: string | null;
  sessionEmail: string | null;
  onSignIn: () => void;
  onNavigate: (view: View) => void;
  onPractice: (card: EvidenceCard) => void;
  onResumePractice?: () => void;
}) {
  const draftKey = `veritas:evidence-topic:v1:${accountId ?? "guest"}`;
  const [draft, setDraft] = useState<ResearchTopic>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
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
    try { return accountId ? readEvidenceCards(sessionStorage, accountId) : []; }
    catch { return []; }
  });
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
    saveEvidenceCards(sessionStorage, accountId, next);
    setCards(next);
  }

  async function execute(selection: NonNullable<typeof submitted>, previous?: Extract<Investigation, { state: "unavailable" }>) {
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
      if (completed.state === "complete") setTraceOpen(false);
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
    if (result?.state !== "unavailable" || !submitted || busy || result.snapshot.calls >= MAX_ASSESSMENT_CALLS || !auth || !accountId) return;
    if (!navigator.onLine) { setError("You’re offline. Reconnect to retry the assessment."); return; }
    void execute(submitted, result);
  }

  const phase = trace.filter(step => step.phase).at(-1)?.phase;
  const interrupted = Boolean(error) || result?.state === "unavailable" || result?.state === "search-failed";
  const hasTrace = trace.length > 0;
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
    {cards.length > 0 && <section className="research-section evidence-saved-cards" id="saved-evidence-cards">
      <h2>Saved evidence cards</h2>
      {cards.map(card => <details className="research-passage" key={card.id}>
        <summary>{card.title}</summary>
        <p className="workspace-meta">{card.motion}</p>
        <EvidenceCardDetails card={card} />
        <button type="button" className="workspace-secondary" onClick={() => onPractice(card)}>Practice with this quote</button>
      </details>)}
    </section>}
    <p className="research-phase workspace-meta" role="status">
      {busy ? `${phase ?? "Finding sources"}${slow ? " · This is taking longer than usual." : ""}` : ""}
    </p>
    {hasTrace && <details className="research-trace" key={traceRun} open={traceOpen} onToggle={event => setTraceOpen(event.currentTarget.open)}>
      <summary>Search activity <span>{busy ? "In progress" : interrupted ? "Interrupted" : "Complete"}</span></summary>
      <div className="research-trace-content">
        <InvestigationTimeline steps={trace} busy={Boolean(busy)} interrupted={interrupted} />
      </div>
    </details>}
    {error && <p className="workspace-error" role="alert">{error} Your claim is still available above.</p>}
    {result && <EvidenceResults result={result} retry={retry} retrying={busy === "retry"} canRetry={result.snapshot.calls < MAX_ASSESSMENT_CALLS}
      topic={submitted?.topic} mode={submitted?.mode} onSave={saveCard} onPractice={onPractice} />}
  </section>;
}
