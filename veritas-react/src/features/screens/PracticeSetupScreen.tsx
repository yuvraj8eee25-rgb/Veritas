import { ArrowLeft, ArrowRight, MessageSquare, Search, Swords, Zap } from "lucide-react";
import { practiceModes, practiceQuestionBanks, type PracticeMode, type PracticeModeInfo } from "../practice-questions";
import type { Difficulty } from "../fallacy-questions";
import type { View } from "../../components/AppShell";

type Level = "all" | Difficulty;
type SetupState = {
  activeMode: PracticeMode;
  activeModeInfo: PracticeModeInfo;
  difficulty: Level;
  selectedQuestionCount: number;
  speedLimit: number;
  setSpeedLimit: (seconds: number) => void;
  setActiveMode: (mode: PracticeMode) => void;
  setDifficulty: (level: Level) => void;
  setView: (view: View) => void;
  startPracticeRun: (mode: PracticeMode, level: Level) => void;
};

const icons = { fallacy: Search, rebuttal: MessageSquare, speed: Zap, steelman: Swords };
const levels = [
  { value: "all", label: "All levels" }, { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" },
] as const;

export default function PracticeSetupScreen({ state }: { state: SetupState }) {
  const { activeMode, activeModeInfo, difficulty, selectedQuestionCount, setActiveMode, setDifficulty, setView, startPracticeRun, speedLimit, setSpeedLimit } = state;
  return (
    <section className="workspace-flow">
      <button type="button" className="workspace-text-action" onClick={() => setView("home")}><ArrowLeft size={16} /> Home</button>
      <h1 className="workspace-page-title">Choose a practice drill</h1>
      <p className="workspace-lead">Work through a short set and review the reasoning after each answer.</p>
      <div className="practice-configuration">
        <fieldset className="workspace-fieldset">
          <legend><span className="setup-step-number">1</span> Choose a practice format</legend>
          <div className="practice-choice-list">
            {practiceModes.map(item => {
              const Icon = icons[item.id];
              return (
                <label className="practice-choice" data-mode={item.id} key={item.id}>
                  <input type="radio" name="practice-format" checked={activeMode === item.id} onChange={() => setActiveMode(item.id)} />
                  <Icon size={19} aria-hidden="true" />
                  <span><strong>{item.name}</strong><small>{item.description}</small></span>
                  <span className="workspace-meta">{practiceQuestionBanks[item.id].length} in bank</span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <aside className="practice-session">
          <p className="workspace-caption"><span className="setup-step-number">2</span> Tune your session</p>
          <h2>{activeModeInfo.name}</h2>
          <fieldset className="workspace-fieldset">
            <legend>Difficulty</legend>
            <div className="workspace-choice-group">{levels.map(level => (
              <label key={level.value}>
                <input type="radio" name="practice-level" checked={difficulty === level.value} onChange={() => setDifficulty(level.value)} />
                {level.label}
              </label>
            ))}</div>
          </fieldset>
          {activeModeInfo.timed && <label className="workspace-field">Time per question
            <select value={speedLimit} onChange={event => setSpeedLimit(Number(event.target.value))}>
              <option value={5}>5 seconds</option><option value={15}>15 seconds</option><option value={0}>Untimed practice</option>
            </select>
          </label>}
          <p className="workspace-meta">{Math.min(8, selectedQuestionCount)} questions in this session{activeModeInfo.timed ? speedLimit ? ` · ${speedLimit} seconds per question` : " · untimed" : ""}</p>
          <button type="button" className="workspace-primary" disabled={!selectedQuestionCount} onClick={() => startPracticeRun(activeMode, difficulty)}>
            Start {activeModeInfo.name}<ArrowRight size={16} aria-hidden="true" />
          </button>
          {!selectedQuestionCount && <p role="status" className="workspace-meta">No questions at this difficulty. Choose a different level.</p>}
        </aside>
      </div>
    </section>
  );
}
