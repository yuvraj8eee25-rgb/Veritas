import LearnerSafetyControls from "./LearnerSafetyControls";
import AccountDataControls from "./AccountDataControls";
import { libraryKeys, restoreLibrary, validateLibraryBackup } from "../lib/library-backup";
import { useState } from "react";
import { auth } from "../lib/supabase";
import { downloadJson } from "../lib/download";

function snapshot(owner: string) {
  return Object.fromEntries(libraryKeys(owner).flatMap(key => {
    try { const raw = localStorage.getItem(key); return raw ? [[key, JSON.parse(raw)]] : []; } catch { return []; }
  }));
}

export default function LearningLibrary({ owner }: { owner: string }) {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [reports, setReports] = useState<any[]>(() => {
    try { const items = JSON.parse(localStorage.getItem(`veritas:debate-reports:${owner}`) || "[]"); return Array.isArray(items) ? items.filter(item => typeof item?.topic === "string" && Array.isArray(item.transcript)) : []; }
    catch { return []; }
  });
  const [blocked, setBlocked] = useState<{ target_id: string; name?: string }[]>([]);
  const [remote, setRemote] = useState<Record<string, unknown>>();
  async function cloud(action: "save" | "load") {
    if (!auth || owner === "guest") return;
    setBusy(true); setStatus("");
    try {
      const { data: session } = await auth.auth.getUser();
      if (session.user?.id !== owner) throw new Error("Sign in again before accessing your library.");
      const result = action === "save"
        ? await auth.from("learning_libraries").upsert({ owner_id: owner, payload: snapshot(owner), updated_at: new Date().toISOString() })
        : await auth.from("learning_libraries").select("payload,updated_at").eq("owner_id", owner).maybeSingle();
      if (result.error) throw new Error("Account library is unavailable. Your device library is unchanged; you can export it below.");
      if (action === "load") {
        const data = result.data as { payload?: Record<string, unknown> } | null;
        setRemote(data?.payload);
        setStatus(data ? "Account copy found. Download it or restore its saved materials on this device." : "No account backup yet.");
      } else setStatus("Your account backup was saved. Saving again replaces the previous account backup.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "Library unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="workspace-flow">
    <h2>Your learning library</h2><p><a href="/help">How storage and AI processing work</a></p>
    <p>Lessons and notes, saved quotes, saved paper summaries and recent debate reports stay on this device. Export a copy before clearing browser data.</p>
    <button className="workspace-secondary" onClick={() => downloadJson("veritas-learning-library.json", { version: 1, exportedAt: new Date().toISOString(), data: snapshot(owner) })}>Export device library</button>
    {owner !== "guest" && <details><summary>Account backup</summary>
      <p>Optional: send your saved library, including extracted paper text, to your private account storage. Saving replaces your previous backup. Downloading keeps a separate copy. Restoring replaces only the saved material types present in the backup. Export this device’s library first if you want to keep both versions.</p>
      <button className="workspace-secondary" disabled={busy} onClick={() => void cloud("save")}>Save account backup</button>{" "}
      <button className="workspace-secondary" disabled={busy} onClick={() => void cloud("load")}>Find account backup</button>
      <button className="workspace-text-action" disabled={busy} onClick={async () => {
        if (!window.confirm("Delete your account library backup? Your device library, classroom work and account remain unchanged.")) return;
        setBusy(true);
        try {
          const { error } = await auth!.from("learning_libraries").delete().eq("owner_id", owner);
          if (error) throw error;
          setRemote(undefined); setStatus("Account library backup removed.");
        } catch { setStatus("Could not remove the account backup. Try again."); }
        finally { setBusy(false); }
      }}>Remove account backup</button>
      {remote && <><button className="workspace-secondary" onClick={() => downloadJson("veritas-account-library.json", { version: 1, data: remote })}>Download account backup</button>
        <button className="workspace-secondary" onClick={() => {
          try {
            const entries = validateLibraryBackup(owner, remote);
            if (!entries.length) { setStatus("This account backup contains no saved material for this account."); return; }
            if (!window.confirm(`Replace this device’s ${entries.map(entry => entry.label.toLowerCase()).join(", ")} with your account backup? Export your device library first to keep a separate copy.`)) return;
            restoreLibrary(localStorage, entries); window.location.reload();
          } catch (error) { setStatus(error instanceof Error ? error.message : "Could not restore the account backup."); }
        }}>Restore account backup on this device</button></>}
    </details>}
    {reports.length > 0 && <section><h3>Recent debate portfolio</h3>{reports.map((report, index) => <details key={`${report.completedAt}-${index}`}>
      <summary>{report.topic} · {typeof report.completedAt === "string" ? new Date(report.completedAt).toLocaleDateString() : "Saved debate"}</summary>
      {typeof report.verdict?.summary === "string" && <p>{report.verdict.summary}</p>}
      {report.transcript.map((turn: any, number: number) => typeof turn?.text === "string" && <article key={number}><strong>{turn.speaker === "user" ? "You" : "AI opponent"}</strong><p>{turn.text}</p></article>)}
      <button className="workspace-secondary" onClick={() => downloadJson("veritas-debate-report.json", report)}>Export this report</button>
      <button className="workspace-text-action" onClick={() => {
        if (!window.confirm("Remove this saved report from this device?")) return;
        const next = reports.filter((_, position) => index !== position);
        try { localStorage.setItem(`veritas:debate-reports:${owner}`, JSON.stringify(next)); setReports(next); }
        catch { setStatus("Could not remove the saved report."); }
      }}>Remove saved report</button>
    </details>)}</section>}
    <button className="workspace-text-action" onClick={() => {
      if (!window.confirm("Remove this device’s saved Study notes, quotes, paper materials and debate portfolio? Account backups, classroom work and practice progress are separate. Export a copy first if you need it.")) return;
      try { for (const key of libraryKeys(owner)) { localStorage.removeItem(key); sessionStorage.removeItem(key); } setReports([]); setStatus("Device library removed. Reopen Study to reload its local state."); }
      catch { setStatus("Some device data could not be removed. Check browser storage settings."); }
    }}>Remove device library</button>
    {owner !== "guest" && <details><summary>Blocked players</summary>
      <button className="workspace-secondary" onClick={async () => {
        const { data, error } = await auth!.from("player_blocks").select("target_id").eq("owner_id", owner);
        if (error) setStatus("Could not load blocked players."); else { const ids = (data || []).map(item => item.target_id);
        const profiles = ids.length ? await auth!.from("profiles").select("uid,display_name").in("uid", ids) : { data: [] };
        setBlocked((data || []).map(item => ({ ...item, name: profiles.data?.find(profile => profile.uid === item.target_id)?.display_name || `Player ${item.target_id.slice(0,8)}` }))); setStatus(data?.length ? "Your blocked players are listed below." : "No blocked players."); }
      }}>Load blocked players</button>
      {blocked.map((player) => <p key={player.target_id}>{player.name} <button className="workspace-text-action" onClick={async () => {
        const { error } = await auth!.from("player_blocks").delete().eq("owner_id", owner).eq("target_id", player.target_id);
        if (error) setStatus("Could not unblock player."); else { setBlocked(current => current.filter(item => item.target_id !== player.target_id)); setStatus("Player unblocked for future public matches."); }
      }}>Unblock</button></p>)}
    </details>}
    {owner !== "guest" && <LearnerSafetyControls key={`safety-${owner}`} owner={owner} />}
    {owner !== "guest" && <AccountDataControls key={owner} owner={owner} />}
    {status && <p role="status">{status}</p>}
  </section>;
}
