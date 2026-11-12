import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowLeft, Copy, Mic, Send, Square } from "lucide-react";
import type { DebateTurn } from "../../App";
import type { View } from "../../components/AppShell";

type RoomState = {
  aiTurnRemaining: number | null;
  debateBusy: boolean;
  debateDraft: string;
  debateError: string;
  debateMaxTurns: number;
  debatePracticeMode: "written" | "speech";
  debateStance: "for" | "against";
  debateTopic: string;
  debateTurns: DebateTurn[];
  discardSpeech: () => void;
  isRecording: boolean;
  playbackUrls: Record<string, string>;
  setDebateDraft: (value: string) => void;
  setView: (view: View) => void;
  speechBlob: Blob | null;
  speechBusy: boolean;
  speechNotice: string;
  speechSeconds: number;
  speechUrl: string;
  startSpeechRecording: () => void;
  stopSpeechRecording: () => void;
  submitAiArgument: (event: FormEvent<HTMLFormElement> | null) => void;
};

export function DebateTranscript({ turns, playbackUrls, copy = false }: {
  turns: DebateTurn[];
  playbackUrls: Record<string, string>;
  copy?: boolean;
}) {
  const [copyStatus, setCopyStatus] = useState("");
  return (
    <>
      <ol className="debate-turn-list" aria-label="Debate transcript">
        {turns.map((turn, index) => (
          <li key={index} data-speaker={turn.speaker}>
            <div className="debate-turn-header">
              <strong>{turn.speaker === "user" ? "Your argument" : "AI opponent"}</strong>
              <span>Turn {Math.floor(index / 2) + 1}{turn.spent === undefined ? "" : ` · ${Math.round(turn.spent)} sec`}</span>
              {copy && turn.speaker === "ai" && <button type="button" className="workspace-icon-button" aria-label={`Copy AI response for turn ${Math.floor(index / 2) + 1}`} onClick={async () => {
                try { await navigator.clipboard.writeText(turn.text); setCopyStatus("Response copied."); }
                catch { setCopyStatus("Copy unavailable. Select the response text to copy it."); }
              }}><Copy size={16} /></button>}
            </div>
            <p>{turn.text}</p>
            {turn.audioPath && playbackUrls[turn.audioPath] && <audio controls src={playbackUrls[turn.audioPath]} aria-label="Recorded argument" />}
          </li>
        ))}
      </ol>
      <span className="sr-only" role="status">{copyStatus}</span>
    </>
  );
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AiDebateRoomScreen({ state }: { state: RoomState }) {
  const {
    aiTurnRemaining, debateBusy, debateDraft, debateError, debateMaxTurns, debatePracticeMode, debateStance,
    debateTopic, debateTurns, discardSpeech, isRecording, playbackUrls, setDebateDraft, setView,
    speechBlob, speechBusy, speechNotice, speechSeconds, speechUrl, startSpeechRecording, stopSpeechRecording,
    submitAiArgument,
  } = state;
  const [elapsed, setElapsed] = useState(0);
  const [slow, setSlow] = useState(false);
  const composer = useRef<HTMLFormElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  const turnCount = debateTurns.filter(turn => turn.speaker === "user").length;
  const speech = debatePracticeMode === "speech";
  const waiting = debateBusy || speechBusy || isRecording;
  const canSend = !waiting && debateDraft.trim().length >= 12 && (!speech || Boolean(speechBlob));

  useEffect(() => {
    if (!isRecording) return;
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, [isRecording]);

  useEffect(() => {
    if (!debateBusy) {
      setSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setSlow(true), 10000);
    return () => window.clearTimeout(timer);
  }, [debateBusy]);

  useEffect(() => {
    if (!textarea.current) return;
    textarea.current.style.height = "auto";
    textarea.current.style.height = `${Math.min(168, textarea.current.scrollHeight)}px`;
  }, [debateDraft]);

  return (
    <section className="workspace-flow debate-room">
      <button type="button" className="workspace-text-action" disabled={debateBusy || isRecording} onClick={() => setView("ai-setup")}><ArrowLeft size={16} /> Leave debate</button>
      <header className="debate-room-heading">
        <div><p className="workspace-caption">You argue {debateStance} the motion</p><h1 className="workspace-page-title">{debateTopic}</h1></div>
        <div className="debate-room-round">
          <span>{turnCount} of {debateMaxTurns} turns sent</span>
          <strong role="timer" aria-label={debateBusy ? "Clock paused" : aiTurnRemaining === null ? "Unlimited turn time" : `${aiTurnRemaining} seconds left`}>
            {debateBusy ? "Clock paused" : aiTurnRemaining === null ? "Untimed" : clock(aiTurnRemaining)}
          </strong>
        </div>
      </header>
      <p className="workspace-meta" role="status">{debateBusy ? (turnCount === debateMaxTurns && debateTurns.at(-1)?.speaker === "ai" ? "The referee is preparing your report." : "The AI opponent is preparing a response.") : "Your turn to make a case."}{debateBusy && slow ? " This is taking longer than usual." : ""}</p>
      <span className="sr-only" role="status">{aiTurnRemaining === 10 ? "Ten seconds left in your turn" : ""}</span>
      {debateTurns.length ? <DebateTranscript turns={debateTurns} playbackUrls={playbackUrls} copy /> : (
        <div className="workspace-empty"><strong>Make your opening argument</strong><p>State your position and give a reason the other side can respond to.</p></div>
      )}
      <div ref={latest} />
      <form ref={composer} className="debate-composer" onSubmit={event => void submitAiArgument(event)}>
        <div className="debate-composer-top">
          <label htmlFor="debate-argument">{speech ? "Review your transcript" : "Your argument"}</label>
          {debateTurns.length > 2 && <button type="button" className="workspace-text-action" onClick={() => latest.current?.scrollIntoView({ block: "center" })}><ArrowDown size={15} /> Latest turn</button>}
        </div>
        {speech && <div className="debate-recording">
          <p className="workspace-meta">Veritas sends the recording for transcription when you stop. Sending the turn stores your audio in private debate storage.</p>
          <div>
            <button type="button" className="workspace-secondary" disabled={speechBusy || debateBusy} onClick={() => {
              if (isRecording) stopSpeechRecording();
              else { setElapsed(0); startSpeechRecording(); }
            }}>{isRecording ? <><Square size={15} /> Stop recording</> : <><Mic size={16} /> Record speech</>}</button>
            {speechBlob && <button type="button" className="workspace-text-action" disabled={debateBusy} onClick={discardSpeech}>Discard recording</button>}
            {isRecording && <span role="timer" aria-label="Recording duration">{clock(elapsed)} / {clock(speechSeconds)}</span>}
          </div>
          {speechUrl && <audio controls src={speechUrl} aria-label="Review your recording" />}
          {speechNotice && <p className="workspace-meta" role="status">{speechNotice}</p>}
        </div>}
        <textarea ref={textarea} id="debate-argument" value={debateDraft} onChange={event => setDebateDraft(event.target.value)}
          rows={2} maxLength={8000} readOnly={waiting} aria-describedby="debate-argument-hint"
          onKeyDown={event => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (canSend) composer.current?.requestSubmit();
            }
          }} />
        {debateError && <p className="workspace-error" role="alert">{debateError}</p>}
        <div className="debate-composer-actions">
          <span id="debate-argument-hint" className="workspace-meta">At least 12 characters. Enter sends, Shift+Enter adds a line.</span>
          <button type="submit" className="workspace-primary" disabled={!canSend}><Send size={15} />{debateBusy ? "Waiting for response" : debateError && debateDraft ? "Retry argument" : "Send argument"}</button>
        </div>
      </form>
    </section>
  );
}
