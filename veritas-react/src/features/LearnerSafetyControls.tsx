import { useEffect, useState } from "react";
import { auth } from "../lib/supabase";

export default function LearnerSafetyControls({ owner }: { owner: string }) {
  const [ageBand, setAgeBand] = useState("");
  const [optIn, setOptIn] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    async function load() {
      if (!auth) { setBusy(false); return; }
      try {
        const { data, error } = await auth.from("learner_safety_preferences").select("age_band,public_match_opt_in").eq("owner_id", owner).maybeSingle();
        if (error) throw error;
        if (current) { setAgeBand(data?.age_band ?? ""); setOptIn(data?.public_match_opt_in ?? false); setLoaded(true); setMessage(""); }
      } catch { if (current) setMessage("Could not load live-practice preferences. Try again before changing them."); }
      finally { if (current) setBusy(false); }
    }
    setBusy(true); void load();
    return () => { current = false; };
  }, [owner, attempt]);

  return <details className="workspace-note"><summary>Age band and live-practice choices</summary>
    <p>Veritas is for teens and adults. Choose an age band; no date of birth is collected. This is a self-declaration, not identity verification. For learners under 13, use another teacher-approved resource.</p>
    <p>Teen live practice uses a teacher-managed private assignment. Personal room codes are for adults. Public matchmaking is off until an adult explicitly opts in. Classroom membership is still checked for every assigned room.</p>
    {!loaded ? <button className="workspace-secondary" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{busy ? "Loading preferences…" : "Retry loading preferences"}</button> : <form onSubmit={async event => {
      event.preventDefault(); if (!auth || busy || !ageBand) return;
      setBusy(true); setMessage("");
      try {
        const { data: user, error: userError } = await auth.auth.getUser();
        if (userError || user.user?.id !== owner) throw new Error("Sign in again before changing these preferences.");
        const { error } = await auth.rpc("save_my_safety_preferences", { p_age_band: ageBand, p_public_match_opt_in: ageBand === "adult" && optIn });
        if (error) throw new Error("Could not save preferences. Your previous settings remain in effect.");
        setMessage("Preferences saved. Turning public matches off also leaves any waiting public queue. A debate already started is unchanged.");
      } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save preferences."); }
      finally { setBusy(false); }
    }}>
      <label className="workspace-field">Your age band<select required value={ageBand} onChange={event => { setAgeBand(event.target.value); setOptIn(false); }}>
        <option value="" disabled>Choose an age band</option><option value="teen">Teen (13–17)</option><option value="adult">Adult (18+)</option>
      </select></label>
      {ageBand === "adult" && <label><input type="checkbox" checked={optIn} onChange={event => setOptIn(event.target.checked)} /> I choose public matchmaking with other opted-in adults.</label>}
      <button className="workspace-secondary" disabled={busy || !ageBand}>{busy ? "Saving…" : "Save live-practice preferences"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </details>;
}
