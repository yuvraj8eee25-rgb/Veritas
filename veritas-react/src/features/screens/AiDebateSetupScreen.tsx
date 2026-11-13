import { ArrowRight } from "lucide-react";
import type { Assignment } from "../Classroom";
import type { HotTopic } from "../../App";
import type { View } from "../../components/AppShell";

type Opponent = "sparring" | "rival" | "champion";
type Stance = "for" | "against";
type Format = "written" | "speech";
type SetupState = {
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
    aiTopicSamples, assignedPractice, beginAiDebate, debateBot, debateError, debateMaxTurns, debatePracticeMode,
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
      <form className="debate-setup-grid" onSubmit={event => { event.preventDefault(); beginAiDebate(); }}>
        <div className="debate-motion">
          <label className="workspace-field">Debate motion
            <textarea readOnly={assigned} required rows={4} maxLength={200} value={debateTopic}
              placeholder="Should cities make public transport free?" onChange={event => setDebateTopic(event.target.value)} />
          </label>
          <p className="workspace-meta">{debateTopic.length}/200 characters</p>
          {assigned ? <p className="workspace-meta">Your classroom assignment sets the motion, format, and timing.</p> : (
            <>
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
            <legend>Your stance</legend>
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
          <h2>Debate settings</h2>
          <label className="workspace-field">Opponent
            <select value={debateBot} onChange={event => setDebateBot(event.target.value as Opponent)}>
              <option value="sparring">Sparring partner</option><option value="rival">Rival</option><option value="champion">Champion</option>
            </select>
          </label>
          <p className="workspace-meta">{opponents[debateBot]}</p>
          <label className="workspace-field">Format
            <select disabled={assigned} value={debatePracticeMode} onChange={event => setDebatePracticeMode(event.target.value as Format)}>
              <option value="written">Written</option><option value="speech">Recorded speech</option>
            </select>
          </label>
          <label className="workspace-field">Turns per side
            <select disabled={assigned} value={debateMaxTurns} onChange={event => setDebateMaxTurns(event.target.value === "5" ? 5 : 3)}>
              <option value="3">3 turns</option><option value="5">5 turns</option>
            </select>
          </label>
          {debatePracticeMode === "speech" ? <>
            <label className="workspace-field">Maximum recording length
              <select disabled={assigned} value={speechSeconds} onChange={event => setSpeechSeconds(Number(event.target.value))}>
                <option value="60">60 seconds</option><option value="90">90 seconds</option><option value="180">3 minutes</option>
              </select>
            </label>
            <p className="workspace-meta">You have three additional minutes to prepare and review the transcript.</p>
          </> : <label className="workspace-field">Time per written turn
            <select disabled={assigned} value={debateTurnSeconds} onChange={event => setDebateTurnSeconds(Number(event.target.value))}>
              <option value="0">Unlimited</option><option value="180">3 minutes</option><option value="45">45 seconds</option>
            </select>
          </label>}
          {debateError && <p className="workspace-error" role="alert">{debateError}</p>}
          {canDebate ? <button type="submit" className="workspace-primary">Begin debate <ArrowRight size={16} /></button> : (
            <div className="workspace-note" role="status">
              <strong>{isSupabaseConfigured ? "Account required" : "Debate service unavailable"}</strong>
              <p>{isSupabaseConfigured ? "Sign in to exchange arguments with the AI opponent." : "You can set up a motion here. Local drills are available while the backend is unconfigured."}</p>
              <button type="button" className="workspace-text-action" onClick={() => isSupabaseConfigured ? setGuestMode(false) : setView("setup")}>
                {isSupabaseConfigured ? "Go to sign in" : "Explore local practice"} <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </form>
    </section>
  );
}
