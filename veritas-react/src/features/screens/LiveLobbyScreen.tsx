import { ArrowLeft, ArrowRight, Shuffle } from "lucide-react";
import ChoiceField from "@/components/ChoiceField";
import type { View } from "@/components/AppShell";
import type { HotTopic } from "../../App";
import type { Assignment } from "../Classroom";

type Format = "written" | "speech";
type LobbyState = {
  isSupabaseConfigured: boolean;
  sessionEmail: string | null;
  assignedPractice: Assignment | null;
  createPrivateRoom: () => Promise<void>;
  joinPrivateRoom: () => Promise<void>;
  joinPublicQueue: () => Promise<void>;
  livePracticeMode: Format;
  liveTopic: string;
  liveTopics: HotTopic[];
  liveTurns: number;
  matchError: string;
  privateBusy: boolean;
  privateCode: string;
  privateNotice: string;
  privateRoom: { code: string; closed: boolean } | null;
  setLivePracticeMode: (value: Format) => void;
  setLiveTopic: (value: string) => void;
  setLiveTurns: (value: 3 | 5) => void;
  setPrivateCode: (value: string) => void;
  setSpeechSeconds: (value: number) => void;
  setGuestMode: (value: boolean) => void;
  setView: (view: View) => void;
  speechSeconds: number;
};

export default function LiveLobbyScreen({ state }: { state: LobbyState }) {
  const {
    isSupabaseConfigured, sessionEmail, setGuestMode, assignedPractice, createPrivateRoom,
    joinPrivateRoom, joinPublicQueue, livePracticeMode, liveTopic, liveTopics, liveTurns,
    matchError, privateBusy, privateCode, privateNotice, privateRoom, setLivePracticeMode, setLiveTopic,
    setLiveTurns, setPrivateCode, setSpeechSeconds, setView, speechSeconds,
  } = state;
  const assigned = Boolean(assignedPractice);
  const topics = liveTopics.filter(topic => topic.text.trim() && topic.text.length <= 200);
  const selected = topics.find(topic => topic.text === liveTopic);
  const alternatives = topics.filter(topic => topic.text !== liveTopic);
  const shuffle = () => {
    const topic = alternatives[Math.floor(Math.random() * alternatives.length)];
    if (topic) setLiveTopic(topic.text);
  };

  return (
    <section className="workspace-flow live-lobby">
      <button type="button" className="workspace-text-action" onClick={() => setView("home")}>
        <ArrowLeft size={16} aria-hidden="true" /> Home
      </button>
      <h1 className="workspace-page-title">Live Debate</h1>
      <p className="workspace-lead">Practise with a partner using the live options available to your account.</p>
      <p className="workspace-note">Public matches require an adult age band and explicit opt-in. Teens use a teacher-managed private assignment. <button type="button" className="workspace-text-action" onClick={() => setView("profile")}>Manage live-practice preferences in Profile</button></p>
      {!sessionEmail ? (
        <div className="workspace-note">
          <strong>{isSupabaseConfigured ? "Sign in to join a debate" : "Matchmaking unavailable"}</strong>
          <button type="button" className="workspace-text-action" onClick={() => isSupabaseConfigured ? setGuestMode(false) : setView("setup")}>
            {isSupabaseConfigured ? "Go to sign in" : "Open local practice"}
          </button>
        </div>
      ) : (
        <>
          <section className="surface-flat live-lobby-setup" aria-labelledby="live-setup-title">
            <h2 id="live-setup-title">Debate setup</h2>
            <label className="workspace-field">Debate motion
              <input value={liveTopic} readOnly={assigned} onChange={event => setLiveTopic(event.target.value)}
                maxLength={200} placeholder="Leave blank for an open match" />
            </label>
            {!assigned && topics.length > 0 && (
              <div className="live-topic-chips" aria-label="Suggested motions" role="group">
                {topics.slice(0, 3).map(topic => (
                  <button type="button" className="workspace-secondary choice-chip" key={topic.text}
                    aria-pressed={topic.text === liveTopic} onClick={() => setLiveTopic(topic.text)}>{topic.text}</button>
                ))}
                <button type="button" className="workspace-secondary choice-chip" disabled={!alternatives.length} onClick={shuffle}>
                  <Shuffle size={15} aria-hidden="true" /> Shuffle topic
                </button>
              </div>
            )}
            {selected?.newsUrl && <a className="live-topic-source" href={selected.newsUrl} target="_blank" rel="noopener noreferrer">
              Inspired by {selected.newsSource || "a news story"}
            </a>}
            <div className="live-settings-grid">
              <ChoiceField<Format> label="Practice format" value={livePracticeMode} disabled={assigned} onChange={setLivePracticeMode}
                options={[{ value: "written", label: "Written debate" }, { value: "speech", label: "Recorded speech" }]} />
              <ChoiceField<3 | 5> label="Turns per side" value={liveTurns === 5 ? 5 : 3} disabled={assigned} onChange={setLiveTurns}
                options={[{ value: 3, label: "3 turns" }, { value: 5, label: "5 turns" }]} />
              {livePracticeMode === "speech" && <ChoiceField label="Speech length" value={speechSeconds} disabled={assigned} onChange={setSpeechSeconds}
                options={[{ value: 60, label: "60 seconds" }, { value: 90, label: "90 seconds" }, { value: 180, label: "3 minutes" }]} />}
            </div>
          </section>
          {matchError && <p className="workspace-error" role="alert">{matchError}</p>}
          <div className="live-lobby-actions">
            {assignedPractice?.kind !== "private_debate" && <section className="surface-raised live-lobby-action" aria-labelledby="public-match-title">
              <h2 id="public-match-title">Public match</h2>
              <p>{liveTopic.trim() ? "Find an opponent debating this motion." : "Join the open queue and let Veritas choose a motion."}</p>
              <button type="button" className="workspace-primary" onClick={() => void joinPublicQueue()}>Find opponent <ArrowRight size={16} aria-hidden="true" /></button>
            </section>}
            {assignedPractice?.kind !== "live_debate" && <section className="surface-raised live-lobby-action" aria-labelledby="private-match-title">
              <h2 id="private-match-title">Private room</h2>
              <p>Invite a partner by sharing a room code.</p>
              <button type="button" className="workspace-secondary" disabled={privateBusy || liveTopic.trim().length < 3} onClick={() => void createPrivateRoom()}>Create room</button>
              <form className="live-join-row" onSubmit={event => {
                event.preventDefault();
                if (!privateBusy && [8, 12].includes(privateCode.trim().length)) void joinPrivateRoom();
              }}>
                <label className="workspace-field">Room code
                  <input value={privateCode} onChange={event => setPrivateCode(event.target.value.toUpperCase())}
                    maxLength={12} autoComplete="off" spellCheck={false} placeholder="Code from your partner" />
                </label>
                <button type="submit" className="workspace-secondary" disabled={privateBusy || ![8, 12].includes(privateCode.trim().length)}>Join</button>
              </form>
              {privateNotice && <p className="workspace-meta" role="status">{privateNotice}</p>}
              {privateRoom && !privateRoom.closed && <p className="private-room-code">Share this code: <strong>{privateRoom.code}</strong></p>}
            </section>}
          </div>
        </>
      )}
    </section>
  );
}
