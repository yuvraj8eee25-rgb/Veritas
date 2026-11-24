import { useState } from "react";
import { compareArgumentWording } from "../lib/evidence-cards";
import { downloadJson } from "../lib/download";
export default function TurnRevision({ original, feedback, turn }: { original: string; feedback: string; turn: number }) {
  const [revision, setRevision] = useState(original);
  const [compared, setCompared] = useState(false);
  const wording = compareArgumentWording(original, revision);
  return <details><summary>Revise turn {turn} using this feedback</summary><p>{feedback}</p>
    <label className="workspace-field">Your revised argument<textarea maxLength={4000} value={revision} onChange={event => { setRevision(event.target.value); setCompared(false); }} /></label>
    <button className="workspace-secondary" onClick={() => setCompared(true)}>Compare wording</button>{" "}
    <button className="workspace-secondary" onClick={() => downloadJson(`veritas-turn-${turn}-revision.json`, { original, revision, feedback, revisedAt: new Date().toISOString() })}>Export revision</button>
    {compared && <div><h4>Original</h4><blockquote>{wording.original.map((span, index) => span.changed ? <mark key={index}>{span.text}</mark> : span.text)}</blockquote><h4>Revision</h4><blockquote>{wording.revised.map((span, index) => span.changed ? <mark key={index}>{span.text}</mark> : span.text)}</blockquote><p className="workspace-meta">Highlighted wording changed. This comparison does not reassess the argument or alter the original score.</p></div>}
  </details>;
}
