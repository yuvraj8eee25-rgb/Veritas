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

export default function EvidenceLab({ sessionEmail, onSignIn, onNavigate }: {
  sessionEmail: string | null;
  onSignIn: () => void;
  onNavigate: (view: View) => void;
}) {
  const signedIn = Boolean(sessionEmail);
  const draftKey = `veritas:evidence-draft:${sessionEmail ?? "guest"}`;
  const [claim, setClaim] = useState(() => {
    try { return sessionStorage.getItem(draftKey)?.slice(0, 500) ?? ""; }
    catch { return ""; }
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

  function updateClaim(value: string) {
    setClaim(value);
    setError("");
    try {
      if (value) sessionStorage.setItem(draftKey, value);
      else sessionStorage.removeItem(draftKey);
    } catch {
      // The draft stays in memory when browser storage is unavailable.
    }
  }

  async function execute(type: "search" | "retry", previous?: Extract<Investigation, { state: "unavailable" }>) {
    const controller = run.current.begin(type);
    if (!controller) return;
    const submitted = claim;
    setBusy(type);
    setError("");
    setTraceOpen(true);
    if (type === "search") {
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
        : await runInvestigation(submitted, invokeVeritasFunction, controller.signal, log);
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
    if (busy === "search" || !auth || !signedIn) return;
    if (!navigator.onLine) { setError("You’re offline. Reconnect to investigate this claim."); return; }
    if (claim.trim().length < 8) { setError("Enter a clear, testable claim (at least 8 characters)."); return; }
    void execute("search");
  }

  function retry() {
    if (result?.state !== "unavailable" || busy || result.snapshot.calls >= MAX_ASSESSMENT_CALLS || !auth || !signedIn) return;
    if (!navigator.onLine) { setError("You’re offline. Reconnect to retry the assessment."); return; }
    void execute("retry", result);
  }

  const phase = trace.at(-1)?.title;
  const interrupted = Boolean(error) || result?.state === "unavailable" || result?.state === "search-failed";
  const hasTrace = trace.length > 0;
  return <section className="workspace-flow research-workspace">
    <h1 className="workspace-page-title">Evidence Lab</h1>
    <p className="workspace-lead">Examine a claim, compare evidence from both sides, and read the original sources.</p>
    <form className="research-form" onSubmit={investigate}>
      <label className="workspace-field">Claim to investigate
        <textarea rows={3} value={claim} onChange={event => updateClaim(event.target.value)} maxLength={500}
          placeholder="For example, more urban trees reduce heat-related illness during summer." />
      </label>
      <div className="research-form-actions">
        <span className="workspace-meta">{claim.length}/500 characters</span>
        <button type="submit" className="workspace-primary" disabled={busy === "search" || !auth || !signedIn || claim.trim().length < 8}>
          {busy === "search" ? <LoaderCircle className="spinner" size={16} aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
          {busy === "search" ? "Investigating…" : "Investigate claim"}
        </button>
      </div>
    </form>
    {(!auth || !signedIn) && <div className="workspace-note">
      <strong>{auth ? "Account required" : "Research service unavailable"}</strong>
      <p>{auth ? "Sign in to run searches and compare source findings." : "Search and AI assessment require a connected backend."}</p>
      <button className="workspace-text-action" onClick={auth ? onSignIn : () => onNavigate("study")}>{auth ? "Go to sign in" : "Study how to assess evidence"}</button>
    </div>}
    {!hasTrace && auth && signedIn && <div className="workspace-empty">
      <strong>Start with a specific claim</strong>
      <p>Use a claim that a source can support or challenge. The results will include excerpts, links, and gaps in the search.</p>
    </div>}
    <p className="research-phase workspace-meta" role="status">
      {busy ? `${phase ?? "Starting investigation"}${slow ? " · This is taking longer than usual." : ""}`
        : result?.state === "complete" ? "Investigation complete. Review the evidence below." : ""}
    </p>
    {hasTrace && <details className="research-trace" key={traceRun} open={traceOpen} onToggle={event => setTraceOpen(event.currentTarget.open)}>
      <summary>Investigation plan and activity <span>{busy ? "In progress" : interrupted ? "Interrupted" : "Complete"}</span></summary>
      <div className="research-trace-content">
        <InvestigationTimeline steps={trace} busy={Boolean(busy)} interrupted={interrupted} />
      </div>
    </details>}
    {error && <p className="workspace-error" role="alert">{error} Your claim is still available above.</p>}
    {result && <EvidenceResults result={result} retry={retry} retrying={busy === "retry"} canRetry={result.snapshot.calls < MAX_ASSESSMENT_CALLS} />}
  </section>;
}
