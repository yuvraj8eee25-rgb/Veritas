import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_EVIDENCE_ARGUMENT, readEvidenceArgument, readEvidenceChallenge, readEvidenceFeedback,
} from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import type {
  CitationAssessment, EvidenceCard, EvidenceChallenge, EvidenceFeedback,
} from "../../../app/supabase/functions/_shared/evidence-practice.ts";
import { invokeVeritasFunction } from "../lib/supabase-functions";
import { compareArgumentWording } from "../lib/evidence-cards";
import { EvidenceCardDetails } from "./EvidenceCard";

const citationLabels: Record<CitationAssessment["status"], string> = {
  accurate: "Accurate use of this excerpt", overstated: "Overstated", unclear: "Unclear", source_not_used: "Source not used",
};

export type EvidenceRound = {
  side: EvidenceCard["side"];
  original: string;
  revision: string;
  challenge: EvidenceChallenge | null;
  feedback: EvidenceFeedback | null;
};

function ArgumentReview({ title, wording, assessment }: {
  title: string; wording: ReturnType<typeof compareArgumentWording>["original"]; assessment: CitationAssessment;
}) {
  return <article className="research-evidence-side evidence-argument-review" data-citation-status={assessment.status}>
    <h3>{title}</h3>
    <blockquote>{wording.map(({ text, changed }, index) => changed ? <mark key={index}>{text}</mark> : text)}</blockquote>
    <p className="evidence-citation-status">{citationLabels[assessment.status]}</p>
    {assessment.sourceSpan && <p><strong>Source wording</strong> · “{assessment.sourceSpan}”</p>}
    <p>{assessment.explanation}</p>
  </article>;
}

export default function EvidencePractice({ card, round, onChange, onBack }: {
  card: EvidenceCard; round: EvidenceRound; onChange: (change: Partial<EvidenceRound>) => void; onBack: () => void;
}) {
  const { side, original, revision, challenge, feedback } = round;
  const wording = useMemo(() => feedback ? compareArgumentWording(original, revision) : null, [feedback, original, revision]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const originalInput = useRef<HTMLTextAreaElement>(null);
  const revisionInput = useRef<HTMLTextAreaElement>(null);
  const reportHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => { request.current?.abort(); }, []);
  useEffect(() => { if (challenge) revisionInput.current?.focus(); }, [challenge]);
  useEffect(() => { if (feedback) reportHeading.current?.focus(); }, [feedback]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (request.current || feedback) return;
    if (!side) { setError("Choose For or Against to start."); return; }
    const first = readEvidenceArgument(original);
    const revised = readEvidenceArgument(revision);
    if (!first || (challenge && !revised)) {
      setError("Write at least one complete sentence.");
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setError("");
    setBusy(true);
    const practiceCard = { ...card, side };
    try {
      if (challenge && revised) {
        const response = await invokeVeritasFunction("ai-debate", {
          action: "evidence_feedback", card: practiceCard, original: first, revision: revised, challenge,
        }, controller.signal);
        if (controller.signal.aborted) return;
        const result = response?.ok === true && readEvidenceFeedback(response.feedback, first, revised, card.quote);
        if (!result) throw new Error("The feedback couldn’t be checked. Try again with your saved revision.");
        onChange({ revision: revised, feedback: result });
      } else {
        const response = await invokeVeritasFunction("ai-debate", {
          action: "evidence_challenge", card: practiceCard, original: first,
        }, controller.signal);
        if (controller.signal.aborted) return;
        const result = response?.ok === true && readEvidenceChallenge(response.challenge, first, card.quote);
        if (!result) throw new Error("The challenge couldn’t be checked. Try again with your saved argument.");
        onChange({ original: first, challenge: result, revision: first });
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Try again with your saved argument.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <section className="workspace-flow evidence-practice">
    <button type="button" className="workspace-text-action evidence-back" onClick={onBack}>Back to Evidence Lab</button>
    <h1 className="workspace-page-title">Practice with this quote</h1>
    <p className="workspace-lead">{card.motion}</p>
    {feedback && wording ? <section className="research-section">
      <h2 ref={reportHeading} tabIndex={-1}>How your argument changed</h2>
      {wording.original.some(span => span.changed) || wording.revised.some(span => span.changed)
        ? <p className="workspace-meta">Highlighted words were removed from the original or added in the revision.</p>
        : <p className="workspace-meta">The wording stayed the same.</p>}
      <div className="research-evidence-grid evidence-revision-comparison">
        <ArgumentReview title="Original argument" wording={wording.original} assessment={feedback.original} />
        <ArgumentReview title="Revised argument" wording={wording.revised} assessment={feedback.revised} />
      </div>
      <p className="workspace-note"><strong>Next step</strong> · {feedback.nextStep}</p>
      <aside className="evidence-feedback-source" aria-label="Source used for feedback"><EvidenceCardDetails card={card} /></aside>
    </section> : <div className="evidence-practice-layout">
      <aside className="research-conclusion evidence-practice-card" aria-label="Evidence card">
        <h2>Your quote</h2>
        <EvidenceCardDetails card={card} />
      </aside>
      <form className="research-form" onSubmit={submit}>
        {challenge ? <section className="evidence-challenge" aria-label="AI challenge">
          <h2>One question</h2>
          <p>{challenge.question}</p>
          <p className="workspace-meta">Source wording</p>
          <blockquote className="evidence-selected-quote">{challenge.sourceSpan}</blockquote>
          <p className="workspace-meta">Your original argument</p>
          <blockquote className="evidence-selected-quote">{original}</blockquote>
        </section> : <fieldset className="workspace-fieldset" disabled={busy}>
          <legend>Which side are you arguing?</legend>
          <div className="workspace-choice-group">
            <label><input required type="radio" name="practice-side" checked={side === "for"} onChange={() => { onChange({ side: "for" }); setError(""); }} /> For</label>
            <label><input required type="radio" name="practice-side" checked={side === "against"} onChange={() => { onChange({ side: "against" }); setError(""); }} /> Against</label>
          </div>
        </fieldset>}
        <label className="workspace-field">{challenge ? "Revise your argument" : "Write one or two sentences using this quote"}
          {challenge ? <textarea ref={revisionInput} required minLength={12} maxLength={MAX_EVIDENCE_ARGUMENT}
            rows={5} value={revision} onChange={event => onChange({ revision: event.target.value })} disabled={busy} />
            : <textarea ref={originalInput} required minLength={12} maxLength={MAX_EVIDENCE_ARGUMENT} rows={4} value={original}
              onChange={event => onChange({ original: event.target.value })} disabled={busy} />}
        </label>
        {!challenge && !original.trim() && <button type="button" className="workspace-text-action" disabled={busy} onClick={() => {
          onChange({ original: "This source found ___. That matters for the motion because ___." });
          requestAnimationFrame(() => { originalInput.current?.focus(); originalInput.current?.setSelectionRange(18, 21); });
        }}>Use a sentence starter</button>}
        {error && <p className="workspace-error" role="alert">{error}</p>}
        <button type="submit" className="workspace-primary" disabled={busy}>
          {busy ? "Waiting for Debate AI…" : challenge ? error ? "Retry feedback" : "Get citation feedback" : "Submit argument"}
        </button>
      </form>
    </div>}
  </section>;
}
