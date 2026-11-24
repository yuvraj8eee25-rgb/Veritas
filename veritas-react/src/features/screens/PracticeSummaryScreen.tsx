import { ArrowRight, CheckCircle2, Flame, Target } from "lucide-react";

type ScreenState = Record<string, any>;

export default function PracticeSummaryScreen({ state }: { state: ScreenState }) {
  const { activeMode, practiceModeInfo, progress, setView, startPracticeRun, summary } = state;
  const missed = summary?.answers.find((answer: any) => !answer.correct);
  const mode = practiceModeInfo(summary?.mode || activeMode);
  const strength = (summary?.accuracy || 0) >= 80
    ? "You identified the core reasoning patterns consistently."
    : "You completed the full set and built a useful baseline.";
  const priority = missed?.tip || "Move up a difficulty level and keep testing the same skill under more pressure.";
  const nextAction = (summary?.accuracy || 0) < 50
    ? { label: "Rebuild this skill", detail: "Use an easier fresh set to reinforce the core pattern." }
    : (summary?.accuracy || 0) < 80
      ? { label: "Try a fresh set", detail: "Stay at this level and apply the feedback to new questions." }
      : { label: "Increase the challenge", detail: "Move up a level while the reasoning pattern is fresh." };

  return (
    <section className="quiz-panel summary-panel">
      {!summary?.baseline && <span className="eyebrow">{summary?.daily ? "DAILY CHALLENGE COMPLETE" : summary?.accuracy === 100 ? "FLAWLESS RUN" : "PRACTICE COMPLETE"}</span>}
      <h1>{summary?.baseline ? "First drill complete" : summary?.daily ? "You showed up today." : "Here’s your coaching summary."}</h1>
      <p className="quiz-lead">{summary?.baseline ? "Check your dashboard for a recommendation based on your answers." : "Start with the clearest takeaway, then review the detail when you’re ready."}</p>

      <div className="result-grid">
        <article><small>ACCURACY</small><strong>{summary?.accuracy}%</strong><span>{summary?.correct} of {summary?.total} correct</span></article>
        <article><small>DRILL SCORE</small><strong>{summary?.score}</strong><span>Best streak: {summary?.streak}</span></article>
        <article><small>XP EARNED</small><strong>+{summary?.xp}</strong><span>{progress.totalXp.toLocaleString()} total XP</span></article>
      </div>
      {summary?.streak >= 2 && <p className="summary-combo"><Flame size={17} aria-hidden="true" /> {summary.streak}-answer chain</p>}

      <div className="result-coaching-grid">
        <article data-tone="strength"><CheckCircle2 size={20} aria-hidden="true" /><div><span>What worked</span><h2>Your strength</h2><p>{strength}</p></div></article>
        <article data-tone="priority"><Target size={20} aria-hidden="true" /><div><span>Focus next</span><h2>Your priority</h2><p>{priority}</p></div></article>
      </div>

      {missed && <details className="result-detail">
        <summary>Review the key missed question</summary>
        <p>{missed.prompt}</p>
      </details>}

      <div className="mastery-note">
        <strong>{mode.skill} mastery estimate: {Math.round(progress.skills?.[mode.skill] || 0)}%</strong>
        <span>{summary && summary.skillGain !== 0 && `${summary.skillGain > 0 ? "+" : ""}${summary.skillGain} this session · `}{summary?.assessed} fresh checks recorded.</span>
      </div>
      {!summary?.daily && <p className="summary-next-reason"><strong>Recommended next step:</strong> {nextAction.detail}</p>}
      <p><a href={`/workspace/study?lesson=${({fallacy:"reasoning-cause",rebuttal:"arg-counter",speed:"arg-claim",steelman:"other-steelman"} as Record<string,string>)[summary?.mode || "fallacy"]}`}>Study the reasoning behind this skill</a></p>
      <div className="summary-actions">
        <button className="workspace-secondary" onClick={() => setView("home")}>Back to dashboard</button>
        {!summary?.daily && <button className="workspace-primary" onClick={() => startPracticeRun(summary?.mode || "fallacy", summary?.recommended || "hard", true)}>
          {nextAction.label} <ArrowRight size={16} />
        </button>}
      </div>
    </section>
  );
}
