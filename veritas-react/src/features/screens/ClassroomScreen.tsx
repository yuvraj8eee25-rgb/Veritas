import dynamic from "next/dynamic";

function ClassroomUnavailable() {
  return <section className="workspace-flow">
    <h1 className="workspace-page-title">Classroom</h1>
    <p className="workspace-error" role="alert">Classroom could not load. Check your connection and reload to try again.</p>
    <button type="button" className="workspace-secondary" onClick={() => window.location.reload()}>Reload Veritas</button>
  </section>;
}

const Classroom = dynamic(() => import("../Classroom").catch(() => ({ default: ClassroomUnavailable })), {
  loading: () => <section className="workspace-flow" aria-busy="true">
    <h1 className="workspace-page-title">Classroom</h1>
    <p role="status">Opening Classroom…</p>
  </section>,
});

type ScreenState = Record<string, any>;

export default function ClassroomScreen({ state }: { state: ScreenState }) {
    const { isSupabaseConfigured, sessionEmail, setGuestMode, pendingAssignmentResult, setActiveMode, setAiAssignmentStatus, setAssignedPractice, setDebateBot, setDebateError, setDebateMaxTurns, setDebatePracticeMode, setDebateStance, setDebateTopic, setDebateTurnSeconds, setDifficulty, setLiveAssignmentStatus, setLivePracticeMode, setLiveTopic, setLiveTurns, setMatchError, setNotice, setPrivateCode, setPrivateNotice, setPrivateRoom, setSpeechSeconds, setView, startPracticeRun, submittedLiveAssignmentRef } = state;
  if (!sessionEmail) return (
    <section className="workspace-flow">
      <h1 className="workspace-page-title">Classroom</h1>
      <p className="workspace-lead">Join your cohort, find assignments, and review feedback from your coach.</p>
      <div className="workspace-note">
        <strong>{isSupabaseConfigured ? "Sign in to open Classroom" : "Classroom service unavailable"}</strong>
        <p>{isSupabaseConfigured ? "Your account connects your assignments, submissions, and classroom invitations." : "This installation needs a connected backend to load classrooms and assignments."}</p>
        {isSupabaseConfigured && <button className="workspace-text-action" onClick={() => setGuestMode(false)}>Go to sign in</button>}
        <a className="workspace-text-action" href="/demo/index.html">Preview the club workflow</a>
      </div>
    </section>
  );
  return <Classroom onLaunchDrill={(assignment: any)=>{if(pendingAssignmentResult){setNotice("Submit or retry the saved classroom result before starting another activity.");return;}setAssignedPractice(assignment);const mode=assignment.activity_settings?.drill_mode||"fallacy";const level=assignment.activity_settings?.difficulty||"all";setActiveMode(mode);setDifficulty(level);startPracticeRun(mode,level,false,8,false,assignment);}} onLaunchAiDebate={(assignment: any)=>{if(pendingAssignmentResult){setNotice("Submit or retry the saved classroom result before starting another activity.");return;}setAssignedPractice(assignment);setDebateTopic(assignment.activity_settings?.topic||assignment.title);setDebateStance(assignment.activity_settings?.stance||"for");setDebateBot(assignment.activity_settings?.bot||"rival");setDebatePracticeMode(assignment.activity_settings?.mode||"written");setDebateMaxTurns(assignment.activity_settings?.turns||3);setDebateTurnSeconds(180);setSpeechSeconds(assignment.activity_settings?.speech_seconds||90);setDebateError("");setAiAssignmentStatus("");setView("ai-setup");}} onLaunchLiveDebate={(assignment: any)=>{if(pendingAssignmentResult){setNotice("Submit or retry the saved classroom result before starting another activity.");return;}setAssignedPractice(assignment);setLiveAssignmentStatus("");submittedLiveAssignmentRef.current="";setLiveTopic(assignment.activity_settings?.topic||assignment.title);setLivePracticeMode(assignment.activity_settings?.mode||"written");setLiveTurns(assignment.activity_settings?.turns||3);setSpeechSeconds(assignment.activity_settings?.speech_seconds||90);setPrivateRoom(null);setPrivateCode("");setPrivateNotice("");setMatchError("");setView("live-lobby");}}/>;
}
