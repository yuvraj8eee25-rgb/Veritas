import { useEffect, useState } from "react";
import { BookOpen, GraduationCap, MessageSquareText, Target } from "lucide-react";
import ReasoningDiagram from "../../components/ReasoningDiagram";
import { auth } from "../../lib/supabase";
import { nextClassroomTask, type HomeAssignment } from "../../lib/home-assignment";
import { readStudyStore } from "../../lib/study-storage";
import { practiceModeInfo, type PracticeMode } from "../practice-questions";
import type { Destination } from "../../components/AppShell";

type HomeState = {
  progress: Record<string, any>; recommendedMode: PracticeMode; recentMode?: PracticeMode;
  favoriteMode: { id: PracticeMode; name: string } | null; favoritePlays: number; favoriteBest: number;
  rank: string; nextRank?: number; pct: number; guestMode: boolean; isSupabaseConfigured: boolean;
  notice: string; homeSkillRows: { key: string; label: string }[];
  pendingAssignmentResult: any; submitAssignedResult: (assignment: any, content: string, activity: any) => Promise<unknown>;
  resumeSession: { mode: PracticeMode; questionIndex: number; questions: unknown[]; baseline?: boolean; daily: boolean } | null;
  dismissNotice: () => void; discardResume: () => void; resumePractice: () => void; startBaseline: (id: PracticeMode) => void;
  openPractice: (id: PracticeMode) => void; openAccount: () => void; navigate: (destination: Destination) => void;
  dailyDone: boolean; dailyModeInfo: { name: string }; countdown: string; sessionEmail: string | null; sessionAccountId: string | null; displayName: string | null;
};

export default function HomeScreen({ state }: { state: HomeState }) {
  const { progress, recommendedMode, favoriteMode, favoriteBest, guestMode,
    pendingAssignmentResult, submitAssignedResult, resumeSession, dismissNotice, discardResume,
    resumePractice, startBaseline, openAccount, navigate, notice, sessionAccountId } = state;
  const suggested = practiceModeInfo(recommendedMode);
  const hasProgress = progress.totalRuns > 0;
  const [task, setTask] = useState<HomeAssignment | null>(null);
  const [classroomUnavailable, setClassroomUnavailable] = useState(false);
  const [showDiagram, setShowDiagram] = useState(() => window.matchMedia("(min-width: 1100px)").matches);
  useEffect(() => {
    const media=window.matchMedia("(min-width: 1100px)");
    const update=()=>setShowDiagram(media.matches);
    media.addEventListener("change",update);
    return ()=>media.removeEventListener("change",update);
  },[]);
  const [reviews] = useState(() => {
    try { return Object.values(readStudyStore(localStorage, sessionAccountId || "guest").lessons).filter(item => item?.reviewAt && Date.parse(item.reviewAt) <= Date.now()).length; }
    catch { return 0; }
  });
  useEffect(() => {
    let current = true;
    if (guestMode || !sessionAccountId || !auth) return;
    void (async () => {
      try {
        const {data:user,error:userError} = await auth!.auth.getUser();
        if (userError || user.user?.id !== sessionAccountId || !current) return;
        const {data,error} = await auth!.rpc("classroom_command",{p_action:"workspace",p_data:{}});
        if (error) throw error;
        if (current) setTask(nextClassroomTask(data,sessionAccountId));
      } catch { if (current) setClassroomUnavailable(true); }
    })();
    return () => { current = false; };
  },[guestMode,sessionAccountId]);
  const taskFirst = task && (!task.feedback || task.resubmission) && !resumeSession;
  return <div className="mockup-home">
    <div className="home-heading"><div><h1 className="mockup-heading">Make your next argument stronger.</h1><p className="mockup-sub">Build a clear claim. Find its support. Test the other side.</p></div></div>
    {pendingAssignmentResult && <section className="home-attention" role="status"><div><strong>Your assignment is ready to send</strong><p>A completed activity still needs delivery to Classroom.</p></div><button className="workspace-secondary" onClick={() => void submitAssignedResult(pendingAssignmentResult.assignment, pendingAssignmentResult.content, pendingAssignmentResult.activity)}>Retry submission</button></section>}
    {notice && <p className="mockup-message" role="status">{notice} <button className="mockup-text" onClick={dismissNotice}>Dismiss</button></p>}
    <div className="home-launchpad"><section className="mockup-hero" aria-label={resumeSession ? "Resume practice" : taskFirst ? "Next classroom assignment" : "Suggested practice"}>
      <span className="home-activity-icon" aria-hidden="true">{taskFirst ? <GraduationCap size={25} /> : <Target size={25} />}</span>
      <div className="mockup-label">{resumeSession ? "Pick up where you left off" : taskFirst ? "From your classroom" : "Your next step"}</div>
      <h2>{resumeSession ? `Continue ${practiceModeInfo(resumeSession.mode).name}` : taskFirst ? task.title : hasProgress ? suggested.name : "Spot the weak link."}</h2>
      <p className="mockup-hint">{resumeSession ? `Your answers are saved. Continue at question ${resumeSession.questionIndex + 1} of ${resumeSession.questions.length}.` : taskFirst ? task.resubmission ? "Your teacher requested a revision. Open the assignment to see what to improve." : "A published assignment is waiting for your response." : hasProgress ? suggested.description : "Try a reasoning exercise, weigh the alternatives, and see why an answer works."}</p>
      <div className="mockup-meta"><span className="mockup-pill">{taskFirst ? task.resubmission ? "Revision requested" : "Assigned work" : resumeSession ? "Saved session" : hasProgress ? "Skills practice" : "3-question introduction"}</span><span className="mockup-pill">{taskFirst && task.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString(undefined,{month:"short",day:"numeric"})}` : "Go at your own pace"}</span></div>
      <div className="home-hero-actions"><button type="button" className="mockup-btn" onClick={() => resumeSession ? resumePractice() : taskFirst ? navigate("classroom") : hasProgress ? state.openPractice(recommendedMode) : startBaseline("fallacy")}>{resumeSession ? "Continue practice" : taskFirst ? "Open assignment" : "Start practice"}</button>
        {resumeSession ? <button className="mockup-text" onClick={() => { if (window.confirm("End this session? Your current answers will be discarded.")) discardResume(); }}>End saved session</button> : <span className="home-hero-note">{taskFirst ? "Your teacher’s instructions come first." : "An explanation after every answer."}</span>}
      </div>
    </section><details className="home-diagram-guide" open={showDiagram}><summary>How a strong argument connects</summary><ReasoningDiagram /></details></div>
    {(reviews > 0 || (task && !taskFirst)) && <div className="home-followups">{reviews > 0 && <button onClick={() => navigate("study")}><BookOpen size={18} /><span><strong>{reviews} {reviews === 1 ? "lesson" : "lessons"} ready for review</strong><small>Revisit an idea while it’s still familiar.</small></span></button>}{task && !taskFirst && <button onClick={() => navigate("classroom")}><GraduationCap size={18} /><span><strong>{task.feedback ? "Feedback available" : task.resubmission ? "Revision requested" : "Classroom assignment"}</strong><small>{task.title}</small></span></button>}</div>}
    <div className="mockup-sectionhead"><h2>Choose your next move</h2></div>
    <div className="mockup-grid">
      <button className="mockup-tile" data-tone="learn" onClick={() => navigate("study")}><span className="home-tile-icon" aria-hidden="true"><BookOpen size={24} /></span><strong>Build a new skill</strong><span>Short lessons, worked examples, and a chance to try it yourself.</span><small>Explore lessons</small></button>
      <button className="mockup-tile" data-tone="debate" onClick={() => navigate("ai-setup")}><span className="home-tile-icon" aria-hidden="true"><MessageSquareText size={24} /></span><strong>Make your case</strong><span>Choose a motion and respond to an AI counterargument.</span><small>Set up a debate</small></button>
      <button className="mockup-tile" data-tone="classroom" onClick={() => navigate("classroom")}><span className="home-tile-icon" aria-hidden="true"><GraduationCap size={24} /></span><strong>Learn with your class</strong><span>Find assigned work, your teacher’s feedback and discussion.</span><small>Open Classroom</small></button>
    </div>
    {classroomUnavailable && <p className="workspace-meta">Classroom updates couldn’t load here. <button className="mockup-text" onClick={() => navigate("classroom")}>Check in Classroom</button></p>}
    <div className="home-progress-line"><div><span className="mockup-label">Your practice so far</span><p>{hasProgress ? `${progress.totalRuns} completed runs. Each one is a chance to test your reasoning.` : "Start your first session. Your practice history will grow from here."}</p>{favoriteMode && <small>{favoriteMode.name} · best drill result {favoriteBest}%</small>}</div><button className="mockup-text" onClick={() => navigate("profile")}>View your progress</button></div>
    {guestMode && <div className="mockup-guest"><span>Exploring as a guest. Progress is saved on this device.</span><button className="mockup-text" onClick={openAccount}>Create an account</button></div>}
  </div>;
}
