import { useId, useState } from "react";
import { peerReviewPrompts, peerReviewText } from "../lib/peer-review";
import type { PeerReviewDraft } from "../lib/peer-review";
const blank = (): PeerReviewDraft => ({ claim:"", strength:"", evidence:"", question:"", revision:"" });
export default function PeerReview({ post }: { post: (text: string) => Promise<void> }) {
  const id = useId();
  const [draft, setDraft] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return <details className="workspace-note"><summary>Write a structured peer review</summary>
    <p>Review a claim shared with this classroom. Your review will be posted in the assignment discussion; teachers can identify authors and moderate posts.</p>
    <form onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setMessage("");
      try { await post(peerReviewText(draft)); setDraft(blank()); setMessage("Your peer review was posted to this assignment discussion."); }
      catch (error) { setMessage(error instanceof Error ? error.message : "Could not post. Your review is preserved above."); }
      finally { setBusy(false); }
    }}>
      {peerReviewPrompts.map(([key, label]) => <label className="workspace-field" htmlFor={`${id}-${key}`} key={key}>{label}
        <textarea id={`${id}-${key}`} required minLength={5} maxLength={600} value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} />
      </label>)}
      <button className="workspace-secondary" disabled={busy}>{busy ? "Posting review…" : "Post peer review to discussion"}</button>
    </form>{message && <p role="status">{message}</p>}
  </details>;
}
