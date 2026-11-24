import { useState } from "react";
export default function SpeechFeedback({ source, transcript }: { source: string; transcript: string }) {
  const [seconds, setSeconds] = useState<number>();
  const words = transcript.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
  const cues = transcript.match(/\b(?:um|uh|erm)\b/gi)?.length ?? 0;
  return <div>
    <audio controls aria-label="Recorded argument" src={source} onLoadedMetadata={event => {
      const duration = event.currentTarget.duration;
      if (Number.isFinite(duration) && duration > 0) setSeconds(duration);
    }} />
    <details><summary>Optional delivery notes</summary>
      <dl><div><dt>Transcript words</dt><dd>{words}</dd></div>
        <div><dt>Average words per minute across the recording</dt><dd>{seconds ? Math.round(words / seconds * 60) : "Available when recording duration is known"}</dd></div>
        <div><dt>Potential “um”, “uh” and “erm” cues</dt><dd>{cues}</dd></div></dl>
      <p className="workspace-meta">English transcript cues only. Review them in context using playback. Transcription and pauses affect these measurements; they are separate from reasoning scores and are not a grade.</p>
    </details>
  </div>;
}
