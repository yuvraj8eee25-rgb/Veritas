import { useEffect, useRef } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import type { View } from "../../components/AppShell";
import type { FallacyQuestion } from "../fallacy-questions";
import type { PracticeMode, PracticeModeInfo } from "../practice-questions";

type DrillState = {
  activeMode: PracticeMode;
  activeModeInfo: PracticeModeInfo;
  advanceQuestion: () => void;
  currentAnswer: number | null;
  questionIndex: number;
  questions: FallacyQuestion[];
  score: number;
  setAssignedPractice: (assignment: null) => void;
  setNotice: (message: string) => void;
  setView: (view: View) => void;
  speedSecondsLeft: number;
  streakNow: number;
  submitAnswer: (index: number) => void;
};

const prompts = {
  fallacy: { label: "Argument", instruction: "Which fallacy best describes this reasoning?", review: "Why the fallacy applies" },
  rebuttal: { label: "Original claim", instruction: "Which response addresses the claim most directly?", review: "Relevance and strength" },
  speed: { label: "Statement", instruction: "Decide whether the statement is true or false.", review: "Reasoning" },
  steelman: { label: "Opposing position", instruction: "Choose the strongest fair version of this position.", review: "Fairness and accuracy" },
};

export default function SoloDrillScreen({ state }: { state: DrillState }) {
  const {
    activeMode, activeModeInfo, advanceQuestion, currentAnswer, questionIndex, questions, score,
    setAssignedPractice, setNotice, setView, speedSecondsLeft, streakNow, submitAnswer,
  } = state;
  const question = questions[questionIndex];
  const instruction = prompts[activeMode];
  const answered = currentAnswer !== null;
  const correct = currentAnswer === question?.correct;
  const next = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (answered) next.current?.focus();
    else if (questionIndex > 0) heading.current?.focus();
  }, [answered, questionIndex]);

  if (!question) return (
    <section className="workspace-flow"><h1 className="workspace-page-title">No question available</h1>
      <button className="workspace-text-action" onClick={() => setView("setup")}>Return to practice</button></section>
  );

  return (
    <section className={`workspace-flow drill-workspace drill-${activeMode}`}>
      <div className="drill-top">
        <div>
          <button type="button" className="workspace-text-action" onClick={() => { setAssignedPractice(null); setView("home"); setNotice(""); }}><X size={16} /> Exit drill</button>
          <p className="workspace-caption">{activeModeInfo.name}</p>
        </div>
        <div className="drill-score"><strong>{score}</strong> session points</div>
      </div>
      <div className="drill-progress">
        <progress aria-label="Questions answered" max={questions.length} value={questionIndex + Number(answered)} />
        <div><span>Question {questionIndex + 1} of {questions.length} · {question.difficulty}</span>
          {streakNow >= 2 && <span role="status">{streakNow} correct in a row</span>}</div>
      </div>
      {activeMode === "speed" && <div className="drill-timer" role="timer" aria-label={answered ? "Timer stopped" : `${speedSecondsLeft} seconds remaining`}>
        <strong>{answered ? "Time stopped" : `0:0${speedSecondsLeft}`}</strong><span>{answered ? "Review your answer" : "Seconds left"}</span>
      </div>}
      {activeMode === "speed" && <span className="sr-only" role="status">{!answered && speedSecondsLeft === 2 ? "Two seconds left" : ""}</span>}
      <div className="drill-question" key={questionIndex}>
        <article className="drill-reading">
          <p className="workspace-caption">{instruction.label}</p>
          <h1 ref={heading} tabIndex={-1}>{question.prompt}</h1>
        </article>
        <fieldset className="workspace-fieldset drill-options">
          <legend>{instruction.instruction}</legend>
          {question.options.map((option, index) => {
            const isCorrect = answered && index === question.correct;
            const isWrong = answered && currentAnswer === index && !isCorrect;
            return (
              <button type="button" key={index} disabled={answered} data-result={isCorrect ? "correct" : isWrong ? "incorrect" : undefined}
                onClick={() => submitAnswer(index)}>
                <span className="drill-option-key">{String.fromCharCode(65 + index)}</span>
                <span>{option}{(isCorrect || isWrong) && <small>{isCorrect ? "Correct answer" : "Your answer · incorrect"}</small>}</span>
                {isCorrect ? <Check size={17} aria-hidden="true" /> : isWrong ? <X size={17} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </fieldset>
      </div>
      {answered && (
        <section className="drill-feedback" data-result={correct ? "correct" : "incorrect"}>
          <div role="status">
            <h2>{correct ? "Correct" : currentAnswer === -1 ? "Time is up" : "Not quite"}</h2>
            <div className="drill-explanation">
              <h3>{instruction.review}</h3>
              <p>{question.explain}</p>
              <p className="workspace-meta">{question.tip}</p>
            </div>
          </div>
          <button ref={next} type="button" className="workspace-primary" onClick={advanceQuestion}>
            {questionIndex + 1 === questions.length ? "See your results" : "Next question"}<ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}
    </section>
  );
}
