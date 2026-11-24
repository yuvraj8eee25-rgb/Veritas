import { useState } from "react";
import { auth } from "../lib/supabase";
export default function MatchSafety({ roomId, opponent }: { roomId: string; opponent?: string }) {
  const [reason, setReason] = useState("harassment");
  const [detail, setDetail] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(action: "report" | "block") {
    if (!auth || busy) return;
    if (action === "block" && !window.confirm("Prevent future public matches with this player? Your current debate remains available. You can unblock them from Profile.")) return;
    setBusy(true); setStatus("");
    try {
      const { data } = await auth.auth.getUser();
      if (!data.user) throw new Error("Sign in again.");
      const result = action === "report"
        ? await auth.from("debate_reports").insert({ reporter_id: data.user.id, debate_id: roomId, reason, detail })
        : await auth.from("player_blocks").upsert({ owner_id: data.user.id, target_id: opponent }, { ignoreDuplicates: true });
      if (action === "report" && result.error?.code === "23505") { setStatus("You already submitted a report for this debate. It remains in the operator review queue."); return; }
      if (result.error) throw new Error("Could not save this safety action. Try again.");
      setStatus(action === "report" ? "Report saved for operator review. A report does not automatically remove a player." : "This player is blocked from future public matches with you.");
      if (action === "report") setDetail("");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Action unavailable."); }
    finally { setBusy(false); }
  }
  return <details className="workspace-note"><summary>Player safety</summary>
    <p>Report conduct in this debate, or prevent future public matches with this player.</p>
    {opponent && <button className="workspace-secondary" disabled={busy} onClick={() => void act("block")}>Block future public matches</button>}
    <form onSubmit={event => { event.preventDefault(); void act("report"); }}>
      <label className="workspace-field">Reason<select value={reason} onChange={event => setReason(event.target.value)}>
        <option value="harassment">Harassment</option><option value="unsafe-content">Unsafe content</option><option value="cheating">Cheating</option><option value="other">Other</option>
      </select></label>
      <label className="workspace-field">What happened?<textarea required minLength={10} maxLength={2000} value={detail} onChange={event => setDetail(event.target.value)} /></label>
      <button className="workspace-secondary" disabled={busy || detail.trim().length < 10}>Submit report</button>
    </form>{status && <p role="status">{status}</p>}
  </details>;
}
