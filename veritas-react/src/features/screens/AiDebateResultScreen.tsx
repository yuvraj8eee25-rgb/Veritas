import { ArrowRight } from "lucide-react";
import type { FormEvent } from "react";
import type { DebateTurn, DebateVerdict } from "../../App";
import type { View } from "../../components/AppShell";
import type { PracticeMode } from "../practice-questions";
import type { Assignment } from "../Classroom";
import { DebateTranscript } from "./AiDebateRoomScreen";

type ResultState = {
  aiAssignmentStatus: string;
  aiAssignmentTranscript: DebateTurn[];
  assignedPractice: Assignment | null;
  beginAiDebate: () => void;
  debateEstimated: boolean;
  debateTopic: string;
  debateTurns: DebateTurn[];
  debateVerdict: DebateVerdict | null;
  devilBusy: boolean;
  devilDraft: string;
  devilError: string;
  devilResult: { score: number; feedback: string } | null;
  playbackUrls: Record<string, string>;
  setActiveMode: (mode: PracticeMode) => void;
  setDebateTopic: (topic: string) => void;
  setDevilDraft: (value: string) => void;
  setView: (view: View) => void;
  submitAiAssignment: (turns: DebateTurn[]) => void;
  submitDevilsAdvocateDrill: (event: FormEvent<HTMLFormElement>) => void;
};

export default function AiDebateResultScreen({ state }: { state: ResultState }) {
  const {
    aiAssignmentStatus, aiAssignmentTranscript, assignedPractice, beginAiDebate, debateEstimated,
    debateTopic, debateTurns, debateVerdict, devilBusy, devilDraft, devilError, devilResult, playbackUrls,
    setActiveMode, setDebateTopic, setDevilDraft, setView, submitAiAssignment, submitDevilsAdvocateDrill,
  } = state;
  const estimate = debateEstimated || debateVerdict?.estimated;
  const source = !debateVerdict ? "Assessment unavailable" : estimate ? "Local heuristic estimate" : "Provider-backed AI assessment";
  const outcome = debateVerdict?.winner === "debater" ? "Your case scored higher"
    : debateVerdict?.winner === "ai" ? "The opponent scored higher"
      : debateVerdict?.winner === "tie" ? "The debate was scored a tie" : "Outcome unavailable";
  const missed = debateVerdict?.devilsAdvocate;
  const coaching = estimate ? undefined : debateVerdict?.coaching;
  const missingCoaching = debateVerdict && !estimate && (
    !coaching?.clarity || !coaching.persuasion || !coaching.mostImportantImprovement || coaching.strongestMoment === undefined
  );
  const moment = coaching?.strongestMoment;
  const coachingNotes = [
    { label: "Strongest moment", text: moment ? `Turn ${moment.turn}. ${moment.feedback}` : moment === null ? "The referee identified no standout argument in this exchange." : undefined },
    { label: "Most important improvement", text: coaching?.mostImportantImprovement },
    { label: "Clarity", text: coaching?.clarity },
    { label: "Persuasion", text: coaching?.persuasion },
  ].filter(note => note.text);

  return (
    <section className="workspace-flow debate-report">
      <p className="workspace-caption">{source}</p>
      <h1 className="workspace-page-title">Debate coaching report</h1>
      <p className="workspace-lead">{debateTopic}</p>
      <section className="debate-report-overview">
        <h2>{outcome}</h2>
        {debateVerdict ? <>
          <dl className="debate-score-comparison">
            <div><dt>Your score</dt><dd>{Math.round(debateVerdict.debaterScore)} <small>/ 100</small></dd></div>
            <div><dt>Opponent score</dt><dd>{Math.round(debateVerdict.aiScore)} <small>/ 100</small></dd></div>
          </dl>
          <p>{debateVerdict.summary}</p>
          {!estimate && <p className="workspace-meta">The scores apply to this exchange. The referee reviews logic, evidence, and responsiveness.</p>}
        </> : <p className="workspace-meta">You can still review your transcript or try the debate again.</p>}
      </section>

      {missingCoaching && <p className="workspace-note" role="status"><strong>Incomplete coaching detail.</strong> The referee supplied a verdict and turn feedback. Some coaching notes are unavailable for this exchange.</p>}
      {coachingNotes.length > 0 && <section className="debate-report-section">
        <h2>Coaching notes</h2>
        <dl className="debate-coaching-notes">{coachingNotes.map(({ label, text }) => (
          <div key={label}><dt>{label}</dt><dd>{text}</dd></div>
        ))}</dl>
      </section>}

      {Boolean(debateVerdict?.turnFeedback.length) && <section className="debate-report-section">
        <h2>Turn-by-turn feedback</h2>
        <p className="workspace-meta">{estimate ? "Notes from the local heuristic." : "The referee provides qualitative feedback by turn."}</p>
        {debateVerdict?.turnFeedback.map(item => <article className="debate-turn-review" key={item.turn}>
          <h3>Turn {item.turn}</h3>
          <dl>{([["Logic", item.logic], ["Evidence", item.evidence], ["Responsiveness", item.responsiveness]] as const).map(([label, feedback]) => (
            <div key={label}><dt>{label}</dt><dd>{feedback || "Feedback unavailable"}</dd></div>
          ))}</dl>
        </article>)}
      </section>}

      {missed && <section className="debate-report-section debate-follow-up">
        <p className="workspace-caption">Recommended follow-up · Devil’s Advocate</p>
        <h2>Make the case for the point you missed</h2>
        <blockquote>{missed.missedPoint}</blockquote>
        <p>{missed.challenge}</p>
        {devilResult ? <div className="workspace-note" role="status">
          <strong>AI feedback · {devilResult.score}/100</strong><p>{devilResult.feedback}</p>
        </div> : <form onSubmit={event => void submitDevilsAdvocateDrill(event)}>
          <label className="workspace-field">Your argument
            <textarea required maxLength={600} rows={4} value={devilDraft} onChange={event => setDevilDraft(event.target.value)} />
          </label>
          {devilError && <p className="workspace-error" role="alert">{devilError}</p>}
          <button type="submit" className="workspace-secondary" disabled={devilBusy || !devilDraft.trim()}>{devilBusy ? "Scoring your response…" : "Submit follow-up drill"}</button>
        </form>}
      </section>}

      {!missed && !assignedPractice && <section className="debate-report-section">
        <h2>Follow-up practice</h2>
        <p className="workspace-meta">Practise responding directly to an opposing argument.</p>
        <button type="button" className="workspace-secondary" onClick={() => { setActiveMode("rebuttal"); setView("setup"); }}>
          Open Rebuttal Practice <ArrowRight size={16} />
        </button>
      </section>}

      <details className="debate-report-section debate-report-transcript">
        <summary>Review transcript</summary>
        <DebateTranscript turns={debateTurns} playbackUrls={playbackUrls} />
      </details>
      {aiAssignmentStatus && <p className="workspace-note" role="status">{aiAssignmentStatus}</p>}
      {assignedPractice?.kind === "ai_debate" && aiAssignmentStatus.startsWith("Debate complete,") &&
        <button type="button" className="workspace-text-action" onClick={() => void submitAiAssignment(aiAssignmentTranscript)}>Retry classroom submission</button>}
      <div className="debate-report-actions">
        {assignedPractice?.kind !== "ai_debate" && <>
          <button type="button" className="workspace-primary" onClick={() => { setDebateTopic(""); setView("ai-setup"); }}>New topic <ArrowRight size={16} /></button>
          <button type="button" className="workspace-secondary" onClick={beginAiDebate}>Retry this motion</button>
        </>}
        <button type="button" className="workspace-text-action" onClick={() => setView(assignedPractice?.kind === "ai_debate" ? "classroom" : "home")}>
          {assignedPractice?.kind === "ai_debate" ? "Return to Classroom" : "Return home"}
        </button>
      </div>
    </section>
  );
}
