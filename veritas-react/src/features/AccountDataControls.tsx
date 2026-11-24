import { useState } from "react";
import { auth } from "../lib/supabase";
import { downloadJson } from "../lib/download";
const collections = ["profile","debates","submissions","discussions","drafts","classroom_memberships","organization_memberships","library","blocks","reports","owned_classrooms","owned_organizations","recordings","private_rooms","read_receipts","created_assignments","account_requests","audit_events","safety_preferences"];
export default function AccountDataControls({ owner }: { owner: string }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [request, setRequest] = useState<{ status: string; requested_at: string }>();
  const [confirmation, setConfirmation] = useState("");
  async function checkRequest() {
    if (!auth) return;
    try {
    const { data, error } = await auth.from("account_deletion_requests").select("status,requested_at").eq("owner_id",owner).maybeSingle();
    if (error) setMessage("Could not load your account request. Try again."); else { setRequest(data ?? undefined); setMessage(data ? `Account deletion request: ${data.status}.` : "No account deletion request."); }
    } catch { setMessage("Could not load your account request. Try again."); }
  }
  return <details className="workspace-note"><summary>Account records and deletion requests</summary>
    <p>Export server records separately from your device library. The JSON export includes record metadata and text, not binary attachments or audio files. Download those from their original screens if needed.</p>
    <button className="workspace-secondary" disabled={busy} onClick={async () => {
      if (!auth || busy) return; setBusy(true); setMessage("Preparing your account record export…");
      const data: Record<string, unknown[]> = {}; const incomplete: string[] = [];
      let bytes = 0;
      try {
        const { data: user } = await auth.auth.getUser(); if (user.user?.id !== owner) throw new Error("Sign in again before exporting your data.");
        for (const collection of collections) {
          data[collection] = [];
          if (bytes >= 20_000_000) { incomplete.push(collection); continue; }
          for (let offset = 0; offset < 10000; offset += 100) {
            const result = await auth.rpc("export_my_account_records", { p_collection: collection, p_offset: offset });
            if (result.error || !Array.isArray(result.data?.records)) throw new Error("Could not complete the server export. Your account has not been changed.");
            bytes += new TextEncoder().encode(JSON.stringify(result.data.records)).length;
            data[collection].push(...result.data.records);
            if (!result.data.has_more) break;
            if (bytes >= 20_000_000 || offset === 9900) { incomplete.push(collection); break; }
          }
        }
        downloadJson("veritas-account-records.json", { exportedAt:new Date().toISOString(), complete:!incomplete.length, incompleteCollections:incomplete, binaryFilesIncluded:false, data });
        setMessage(incomplete.length ? "A partial export was downloaded because this account exceeded the browser export limit. The file lists incomplete collections; an operator-assisted export is needed for the remaining records." : "Account records exported. This export does not include binary attachments, recordings or this device’s unsynced library.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Export failed."); }
      finally { setBusy(false); }
    }}>{busy ? "Working…" : "Export account records"}</button>
    <h3>Request account deletion</h3>
    <p>Submitting a request does not immediately delete your account. An operator must review it, including ownership of shared classrooms and organizations. Export your work first. You can cancel a pending request.</p>
    <button className="workspace-text-action" disabled={busy} onClick={() => void checkRequest()}>Check request status</button>
    {request?.status === "pending" ? <button className="workspace-secondary" disabled={busy} onClick={async () => {
      setBusy(true);
      try {
        const result = await auth!.rpc("cancel_my_account_deletion");
        if (result.error) setMessage("Could not cancel the request. Try again."); else await checkRequest();
      } catch { setMessage("Could not cancel the request. Try again."); }
      finally { setBusy(false); }
    }}>Cancel pending deletion request</button> : <form onSubmit={async event => {
      event.preventDefault(); if (!auth || busy || confirmation !== "REQUEST ACCOUNT DELETION") return;
      setBusy(true); setMessage("");
      try {
        const { data, error } = await auth.rpc("request_my_account_deletion", { p_confirm: confirmation });
        if (error) throw new Error("Could not submit the deletion request. Your account has not been deleted.");
        setRequest(data); setConfirmation(""); setMessage("Your deletion request is queued for operator review. Your account remains active until the request is processed.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not submit the request."); }
      finally { setBusy(false); }
    }}><label className="workspace-field">Type REQUEST ACCOUNT DELETION to submit a request<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      <button className="workspace-secondary" disabled={busy || confirmation !== "REQUEST ACCOUNT DELETION"}>Submit account deletion request</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </details>;
}
