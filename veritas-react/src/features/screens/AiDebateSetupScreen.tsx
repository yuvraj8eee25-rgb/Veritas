import DebatePlan from "../DebatePlan";
import type { DebatePlanData } from "../DebatePlan";
import ChoiceField from "@/components/ChoiceField";
import type { Assignment } from "../Classroom";
import type { HotTopic } from "../../App";
import type { View } from "../../components/AppShell";

type Opponent = "sparring" | "rival" | "champion";
type Stance = "for" | "against";
type Format = "written" | "speech";
type SetupState = {
  debatePlan: DebatePlanData | null;
  aiTopicSamples: readonly HotTopic[];
  assignedPractice: Assignment | null;
  beginAiDebate: () => void;
  debateBot: Opponent;
  debateError: string;
  debateMaxTurns: 3 | 5;
  debatePracticeMode: Format;
  debateStance: Stance;
  debateTopic: string;
  debateTurnSeconds: number;
  isSupabaseConfigured: boolean;
  liveTopics: HotTopic[];
  sessionEmail: string | null;
  setDebateBot: (value: Opponent) => void;
  setDebateMaxTurns: (value: 3 | 5) => void;
  setDebatePracticeMode: (value: Format) => void;
  setDebateStance: (value: Stance) => void;
  setDebateTopic: (value: string) => void;
  setDebateTurnSeconds: (value: number) => void;
  setShowAiTopicBrowser: (change: (value: boolean) => boolean) => void;
  setSpeechSeconds: (value: number) => void;
  setView: (view: View) => void;
  setGuestMode: (value: boolean) => void;
  showAiTopicBrowser: boolean;
  speechSeconds: number;
};

const opponents = {
  sparring: "A patient opponent who makes one clear counterargument at a time.",
  rival: "A balanced opponent who presses the weakest part of your case.",
  champion: "A demanding opponent who challenges assumptions and brings competing evidence.",
};

export default function AiDebateSetupScreen({ state }: { state: SetupState }) {
  const {
    debatePlan, aiTopicSamples, assignedPractice, beginAiDebate, debateBot, debateError, debateMaxTurns, debatePracticeMode,
    debateStance, debateTopic, debateTurnSeconds, isSupabaseConfigured, liveTopics, sessionEmail,
    setDebateBot, setDebateMaxTurns, setDebatePracticeMode, setDebateStance, setDebateTopic, setDebateTurnSeconds,
    setGuestMode, setShowAiTopicBrowser, setSpeechSeconds, setView, showAiTopicBrowser, speechSeconds,
  } = state;
  const assigned = assignedPractice?.kind === "ai_debate";
  const topics = (liveTopics.length ? liveTopics : aiTopicSamples).filter(topic => topic.text.trim().length <= 200);
  const canDebate = isSupabaseConfigured && Boolean(sessionEmail);

  return (
    <section className="workspace-flow debate-setup">
      <h1 className="workspace-page-title">Debate AI</h1>
      <p className="workspace-lead">Make a case for or against a motion. An AI opponent will respond to each argument.</p>
      {!canDebate && <div className="workspace-note debate-availability" role="status"><strong>{isSupabaseConfigured ? "Sign in when you’re ready to debate" : "Debate service unavailable"}</strong><p>{isSupabaseConfigured ? "You can explore the setup here. An account is needed to exchange arguments with the AI opponent." : "Local drills are available while the debate service is unconfigured."}</p><button type="button" className="workspace-secondary" onClick={() => isSupabaseConfigured ? setGuestMode(false) : setView("setup")}>{isSupabaseConfigured ? "Go to sign in" : "Open practice skills"}</button></div>}
      <DebatePlan plan={debatePlan} />
      <form className="debate-setup-grid" onSubmit={event => { event.preventDefault(); beginAiDebate(); }}>
        <div className="debate-motion">
          <p className="setup-step"><span className="setup-step-number">1</span> Choose your motion</p>
          <label className="workspace-field">Debate motion
            <textarea readOnly={assigned} required rows={4} maxLength={200} value={debateTopic}
              placeholder="Should cities make public transport free?" onChange={event => setDebateTopic(event.target.value)} />
          </label>
          <p className="workspace-meta">{debateTopic.length}/200 characters</p>
          {assigned ? <p className="workspace-meta">Your classroom assignment sets the motion, format, and timing.</p> : (
            <>
              <div className="debate-starters" aria-label="Starter motions"><span>Try a starting point</span>{["Schools should teach media literacy", "Cities should make public transport free", "Public libraries should extend their opening hours"].map(text => <button type="button" key={text} aria-pressed={debateTopic===text} onClick={() => setDebateTopic(text)}>{text}</button>)}</div>
              <div className="debate-topic-actions">
                <button type="button" className="workspace-text-action" aria-expanded={showAiTopicBrowser}
                  onClick={() => setShowAiTopicBrowser(value => !value)}>{showAiTopicBrowser ? "Hide topic suggestions" : "Browse topic suggestions"}</button>
                <button type="button" className="workspace-text-action" onClick={() => {
                  const options = topics.filter(topic => topic.text !== debateTopic);
                  const chosen = options[Math.floor(Math.random() * options.length)];
                  if (chosen) setDebateTopic(chosen.text);
                }}>Surprise me</button>
              </div>
              {showAiTopicBrowser && <ul className="debate-topic-list" aria-label="Debate topic suggestions">
                {topics.map(topic => <li key={topic.text}>
                  <button type="button" onClick={() => setDebateTopic(topic.text)}>{topic.text}</button>
                  {topic.newsUrl && <a href={topic.newsUrl} target="_blank" rel="noreferrer">Inspired by {topic.newsSource || "a news story"}</a>}
                </li>)}
              </ul>}
            </>
          )}
          <fieldset className="workspace-fieldset">
            <legend><span className="setup-step-number">2</span> Choose your stance</legend>
            <div className="workspace-choice-group">
              <label><input type="radio" name="debate-stance" checked={debateStance === "for"} onChange={() => setDebateStance("for")} /> For the motion</label>
              <label><input type="radio" name="debate-stance" checked={debateStance === "against"} onChange={() => setDebateStance("against")} /> Against the motion</label>
            </div>
            {!assigned && <button type="button" className="workspace-text-action" onClick={() => setDebateStance(Math.random() < .5 ? "for" : "against")}>Random side</button>}
          </fieldset>
          <div className="workspace-note">
            <strong>How feedback works</strong>
            <p>The referee reviews the logic, evidence, and responsiveness of each turn. Your report reflects this debate.</p>
          </div>
        </div>
        <div className="debate-settings">
          <p className="setup-step"><span className="setup-step-number">3</span> Tune the debate</p>
          <h2>Session settings</h2>
          <ChoiceField<Opponent> label="Opponent" value={debateBot} onChange={setDebateBot}
                options={[{ value: "sparring", label: "Sparring partner" }, { value: "rival", label: "Rival" }, { value: "champion", label: "Champion" }]} />
          <p className="workspace-meta">{opponents[debateBot]}</p>
          <ChoiceField<Format> label="Format" value={debatePracticeMode} onChange={setDebatePracticeMode} disabled={assigned}
                options={[{ value: "written", label: "Written" }, { value: "speech", label: "Recorded speech" }]} />
          <details className="debate-advanced">
            <summary>Advanced timing and length</summary>
            <div>
              <ChoiceField<3 | 5> label="Turns per side" value={debateMaxTurns} onChange={setDebateMaxTurns} disabled={assigned}
                options={[{ value: 3, label: "3 turns" }, { value: 5, label: "5 turns" }]} />
              {debatePracticeMode === "speech" ? <>
                <ChoiceField<number> label="Maximum recording length" value={speechSeconds} onChange={setSpeechSeconds} disabled={assigned}
                options={[{ value: 60, label: "60 seconds" }, { value: 90, label: "90 seconds" }, { value: 180, label: "3 minutes" }]} />
                <p className="workspace-meta">You have three additional minutes to prepare and review the transcript.</p>
              </> : <ChoiceField<number> label="Time per written turn" value={debateTurnSeconds} onChange={setDebateTurnSeconds} disabled={assigned}
                options={[{ value: 0, label: "Unlimited" }, { value: 180, label: "3 minutes" }, { value: 45, label: "45 seconds" }]} />}
            </div>
          </details>
          <section className="debate-brief" aria-label="Your debate brief"><h3>Your debate brief</h3><p className="debate-brief-motion">{debateTopic.trim() || "Choose a motion to make it yours."}</p><dl><div><dt>Your side</dt><dd>{debateStance === "for" ? "For the motion" : "Against the motion"}</dd></div><div><dt>Format</dt><dd>{debatePracticeMode === "speech" ? "Recorded speech" : "Written"} · {debateMaxTurns} turns per side</dd></div><div><dt>Timing</dt><dd>{debatePracticeMode === "speech" ? `${speechSeconds} seconds per recording, plus transcript review` : debateTurnSeconds ? `${debateTurnSeconds} seconds per written turn` : "Untimed written turns"}</dd></div></dl><p className="debate-brief-flow">Your case <span aria-hidden="true">/</span> Counterargument <span aria-hidden="true">/</span> Reflection</p>{assigned && <p className="workspace-meta">Motion, format and timing are set by your teacher.</p>}</section>
          {debateError && <p className="workspace-error" role="alert">{debateError}</p>}
          {canDebate ? <button type="submit" className="workspace-primary" disabled={!debateTopic.trim()}>Begin debate</button> : null}
        </div>
      </form>
    </section>
  );
}
