import type { DebatePlanData } from "./features/DebatePlan";
import { utcDay, nextUtcReset, dailyRewardAvailable, completedDailyDate } from "./lib/daily-policy";
import { classroomAnswers } from "./lib/classroom-answers";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Flame, Swords, LoaderCircle } from "lucide-react";
import { auth, isSupabaseConfigured } from "./lib/supabase";
import { invokeVeritasFunction } from "./lib/supabase-functions";
import { type Difficulty, type FallacyQuestion } from "./features/fallacy-questions";
import { practiceModes, practiceQuestionBanks, assignmentQuestionBanks, practiceModeInfo, type PracticeMode } from "./features/practice-questions";
import Study from "./features/Study";
import type { Assignment } from "./features/Classroom";
import ProfileScreen from "./features/Profile";
import ArcadeDashboard from "./features/ArcadeDashboard";
import { applyArcadeRun } from "./features/arcade";
import { aiTopicSamples } from "./features/debate-topics";
import { readDebateCoaching, type DebateCoaching } from "../../app/supabase/functions/_shared/debate-coaching";
import { loadProgress, saveProgress, mergeProgress } from "../../app/src/features/practice-state.js";
import { recordAssessment, prioritizeAssessment } from "../../app/src/features/mastery.js";
import HomeScreen from "./features/screens/HomeScreen";
import PracticeSetupScreen from "./features/screens/PracticeSetupScreen";
import DailyChallengeScreen from "./features/screens/DailyChallengeScreen";
import ProfileViewScreen from "./features/screens/ProfileViewScreen";
import LeaderboardScreen from "./features/screens/LeaderboardScreen";
import StudyScreen from "./features/screens/StudyScreen";
import ClassroomScreen from "./features/screens/ClassroomScreen";
import EvidenceLabScreen from "./features/screens/EvidenceLabScreen";
import EvidencePractice from "./features/EvidencePractice";
import type { EvidenceRound } from "./features/EvidencePractice";
import type { EvidenceCard } from "../../app/supabase/functions/_shared/evidence-practice.ts";
import AiDebateSetupScreen from "./features/screens/AiDebateSetupScreen";
import AiDebateRoomScreen from "./features/screens/AiDebateRoomScreen";
import AiDebateResultScreen from "./features/screens/AiDebateResultScreen";
import LiveLobbyScreen from "./features/screens/LiveLobbyScreen";
import LiveSearchScreen from "./features/screens/LiveSearchScreen";
import LiveDebateRoomScreen from "./features/screens/LiveDebateRoomScreen";
import SoloDrillScreen from "./features/screens/SoloDrillScreen";
import PracticeSummaryScreen from "./features/screens/PracticeSummaryScreen";
import AuthScreen from "./features/screens/AuthScreen";
import AppShell, { type View, type Destination } from "./components/AppShell";

type AuthMode = "login" | "signup" | "forgot" | "reset";
type AnswerRecord = { id: string; answer: number; prompt: string; difficulty: Difficulty; correct: boolean; tip: string };
type RunSummary = { correct: number; total: number; accuracy: number; score: number; streak: number; xp: number; skillGain: number; assessed: number; answers: AnswerRecord[]; recommended: Difficulty; daily: boolean; baseline?: boolean; mode: PracticeMode };
type SavedPracticeSession = {
  mode: PracticeMode;
  difficulty: "all" | Difficulty;
  questions: FallacyQuestion[];
  questionIndex: number;
  answers: AnswerRecord[];
  streak: number;
  bestStreak: number;
  score: number;
  currentAnswer: number | null;
  daily: boolean;
  baseline?: boolean;
  attempt: number;
  assignedPractice: Assignment | null;
  savedAt: string;
  dailyDate?: string;
  speedRemainingMs?: number;
  speedLimit?: number;
};
type ProfileData = { displayName:string|null; elo:number|null; wins:number; losses:number; ties:number; avatarPath:string|null; avatarUrl:string|null };
export type LeaderRow = { name:string; score:number; self?:boolean; record?:string };
export type DebateTurn = { speaker:"user"|"ai"; text:string; audioPath?:string|null; spent?:number };
export type DebateVerdict = { debaterScore:number; aiScore:number; winner:string; summary:string; turnFeedback:{turn:number;logic:string;evidence:string;responsiveness:string}[]; devilsAdvocate?:{missedPoint:string;challenge:string}|null; estimated?:boolean; coaching?:DebateCoaching };
type PendingAssignmentResult = { owner_id: string; assignment: Assignment; request_id: string; content: string; activity: Record<string, any> };
export type HotTopic = {text:string;tag?:string;newsUrl?:string;newsSource?:string};
type LiveTurn = {uid:string;text:string;ts:number;audioPath?:string|null};
type LiveRoomData = {id:string;topic:string;players:string[];player_order:string[];turn_index:number;turns:LiveTurn[];max_turns_per_player:number;turn_seconds:number;speech_seconds:number;practice_mode:string;status:string;created_at:string;last_turn_at:string|null;ai_verdict:any;ratings:Record<string,string>;is_private?:boolean};
function liveTurnStats(room:LiveRoomData) {
  const used:Record<string,number>={},counts:Record<string,number>={};
  let previous=Date.parse(room.created_at);
  const entries=(room.turns||[]).map(turn=>{
    const timestamp=typeof turn.ts==="number"?turn.ts:NaN;
    const spent=Number.isFinite(timestamp)&&Number.isFinite(previous)?Math.max(0,Math.min(room.turn_seconds*1000,timestamp-previous))/1000:null;
    if(spent!==null)used[turn.uid]=(used[turn.uid]||0)+spent;
    previous=Number.isFinite(timestamp)?timestamp:previous;
    counts[turn.uid]=(counts[turn.uid]||0)+1;
    return {spent,number:counts[turn.uid]};
  });
  return {used,entries};
}
function formatLiveClock(seconds:number) { const rounded=Math.max(0,Math.round(seconds));return `${Math.floor(rounded/60)}:${String(rounded%60).padStart(2,"0")}`; }
type PrivateRoomData = {id:string;code:string;debate_id:string|null;expires_at:string;closed:boolean};

const pendingAssignmentStorageKey = "veritas-react-pending-assignment";
const practiceSessionStorageKey = "veritas-react-active-practice";
function readPendingAssignmentResult(): PendingAssignmentResult | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(pendingAssignmentStorageKey) || "null");
    return typeof value?.owner_id === "string" && value.assignment?.id && value?.request_id && typeof value?.content === "string" && value?.activity ? value as PendingAssignmentResult : null;
  } catch { return null; }
}

function readPracticeSession(key: string): SavedPracticeSession | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    return value && practiceModes.some(item => item.id === value.mode)
      && Array.isArray(value.questions) && Array.isArray(value.answers)
      && Number.isInteger(value.questionIndex) && value.questionIndex >= 0
      && value.questionIndex < value.questions.length ? value as SavedPracticeSession : null;
  } catch {
    return null;
  }
}

const viewValues: View[] = ["home", "setup", "daily", "profile", "leaderboard", "study", "classroom", "evidence", "ai-setup", "ai-room", "ai-result", "ai-evidence", "live-lobby", "live-search", "live-room", "game", "summary", "arcade"];

function initialDestination(): View {
  if (typeof window === "undefined") return "home";
  const candidate = window.location.pathname.split("/")[2] || window.location.hash.slice(1);
  return viewValues.includes(candidate as View) ? candidate as View : "home";
}
function safeDestination(next: View): View {
  return next === "game" || next === "summary" ? "home"
    : next === "ai-room" || next === "ai-result" || next === "ai-evidence" ? "ai-setup"
      : next === "live-search" ? "live-lobby" : next;
}
function destinationUrl(next: View, room?: string) {
  return `/workspace/${next}${next === "live-room" && room ? `?room=${encodeURIComponent(room)}` : ""}`;
}

function seededRandom(seed: string) {
  let hash = 1779033703 ^ seed.length;
  for (let index = 0; index < seed.length; index++) hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return ((hash ^= hash >>> 16) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function shuffledOptions(question: FallacyQuestion, random: () => number): FallacyQuestion {
  const tagged = question.options.map((text, index) => ({ text, correct: index === question.correct }));
  const options = shuffled(tagged, random);
  return { ...question, options: options.map(option => option.text), correct: options.findIndex(option => option.correct) };
}

export default function App() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionAccountId, setSessionAccountId] = useState<string | null>(null);
  const [evidencePractice, setEvidencePractice] = useState<{
    accountId: string; card: EvidenceCard; round: EvidenceRound;
  } | null>(null);
  const [guestMode, setGuestMode] = useState(false);
  const [notice, setNotice] = useState("");
  const [progress, setProgressState] = useState(() => loadProgress());
  const progressOwner = sessionAccountId || (guestMode ? "guest" : null);
  const progressOwnerRef = useRef<string | null>(null);
  const [progressReadyForOwner, setProgressReadyForOwner] = useState(false);
  const [view, setView] = useState<View>(() => safeDestination(initialDestination()));
  const viewRef=useRef<typeof view>(view);
  viewRef.current=view;
  const speechFlowRef=useRef({view,sessionEmail});
  const [difficulty, setDifficulty] = useState<"all" | Difficulty>("all");
  const [activeMode, setActiveMode] = useState<PracticeMode>("fallacy");
  const [questions, setQuestions] = useState<FallacyQuestion[]>([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [streakNow, setStreakNow] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [score, setScore] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState<number | null>(null);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const practiceKey = guestMode ? `${practiceSessionStorageKey}:guest`
    : sessionAccountId ? `${practiceSessionStorageKey}:${sessionAccountId}` : null;
  const activePracticeKey = useRef<string | null>(null);
  const [savedPractice, setSavedPractice] = useState<{ key: string; session: SavedPracticeSession } | null>(null);
  const resumeSession = savedPractice?.key === practiceKey ? savedPractice?.session ?? null : null;
  const [pendingAssignmentResult, setPendingAssignmentResult] = useState<PendingAssignmentResult | null>(() => readPendingAssignmentResult());
  const currentPending = pendingAssignmentResult?.owner_id === progressOwner ? pendingAssignmentResult : null;
  const [assignedPractice, setAssignedPractice] = useState<Assignment | null>(() => currentPending?.assignment || null);
  const [liveAssignmentStatus,setLiveAssignmentStatus]=useState("");
  const [attempt, setAttempt] = useState(0);
  const [isDailyRun, setIsDailyRun] = useState(false);
  const [dailyDate, setDailyDate] = useState<string>();
  const [speedLimit, setSpeedLimit] = useState(5);
  const speedRemaining = useRef(5000);
  const [isBaselineRun, setIsBaselineRun] = useState(false);
  const [speedSecondsLeft, setSpeedSecondsLeft] = useState(5);
  const [now, setNow] = useState(Date.now());
  const [profile, setProfile] = useState<ProfileData>({displayName:null,elo:null,wins:0,losses:0,ties:0,avatarPath:null,avatarUrl:null});
  const [profileReady, setProfileReady] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [leaderTab, setLeaderTab] = useState<"xp"|"elo">("xp");
  const [eloRows, setEloRows] = useState<LeaderRow[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [leaderError, setLeaderError] = useState("");
  const [debateTopic,setDebateTopic]=useState("");
  const [debatePlan, setDebatePlan] = useState<DebatePlanData | null>(null);
  const [showAiTopicBrowser,setShowAiTopicBrowser]=useState(false);
  const [debateStance,setDebateStance]=useState<"for"|"against">("for");
  const [debateBot,setDebateBot]=useState<"sparring"|"rival"|"champion">("rival");
  const [debateMaxTurns,setDebateMaxTurns]=useState<3|5>(3);
  const [debateTurnSeconds,setDebateTurnSeconds]=useState(180);
  const [debateTurnStartedAt,setDebateTurnStartedAt]=useState<number|null>(null);
  const [aiTurnNow,setAiTurnNow]=useState(Date.now());
  const [debateTurns,setDebateTurns]=useState<DebateTurn[]>([]);
  const [debateDraft,setDebateDraft]=useState("");
  const [debateBusy,setDebateBusy]=useState(false);
  const [debateError,setDebateError]=useState("");
  const [debateVerdict,setDebateVerdict]=useState<DebateVerdict|null>(null);
  const [devilDraft,setDevilDraft]=useState("");
  const [devilBusy,setDevilBusy]=useState(false);
  const [devilError,setDevilError]=useState("");
  const [devilResult,setDevilResult]=useState<{score:number;feedback:string}|null>(null);
  const [aiAssignmentStatus,setAiAssignmentStatus]=useState("");
  const [aiAssignmentTranscript,setAiAssignmentTranscript]=useState<DebateTurn[]>([]);
  const [debateEstimated,setDebateEstimated]=useState(false);
  const [assessmentBusy, setAssessmentBusy] = useState(false);
  const refereeInFlight = useRef(false);
  const [debatePracticeMode,setDebatePracticeMode]=useState<"written"|"speech">("written");
  const [speechSeconds,setSpeechSeconds]=useState(90);
  const [isRecording,setIsRecording]=useState(false);
  const [speechBusy,setSpeechBusy]=useState(false);
  const [speechNotice,setSpeechNotice]=useState("");
  const [speechBlob,setSpeechBlob]=useState<Blob|null>(null);
  const uploadedSpeech = useRef<{ blob: Blob; path: string } | null>(null);
  const [speechUrl,setSpeechUrl]=useState("");
  const [playbackUrls,setPlaybackUrls]=useState<Record<string,string>>({});
  const [liveTopics,setLiveTopics]=useState<HotTopic[]>([]);
  const [liveTopic,setLiveTopic]=useState("");
  const [liveTurns,setLiveTurns]=useState(3);
  const [livePracticeMode,setLivePracticeMode]=useState<"written"|"speech">("written");
  const [matchSeconds,setMatchSeconds]=useState(0);
  const [matchError,setMatchError]=useState("");
  const [,setMatchedDebateId]=useState<string|null>(null);
  const [liveRoom,setLiveRoom]=useState<LiveRoomData|null>(null);
  const [liveUid,setLiveUid]=useState("");
  const [liveOpponentName,setLiveOpponentName]=useState("Opponent");
  const [liveOpponentElo,setLiveOpponentElo]=useState(1200);
  const [liveRoomLoading,setLiveRoomLoading]=useState(false);
  const [liveDraft,setLiveDraft]=useState("");
  const [liveSending,setLiveSending]=useState(false);
  const [liveSecondsLeft,setLiveSecondsLeft]=useState(180);
  const [liveRatingSent,setLiveRatingSent]=useState(false);
  const [liveEloSummary,setLiveEloSummary]=useState("");
  const [liveRecording,setLiveRecording]=useState(false);
  const [liveSpeechBusy,setLiveSpeechBusy]=useState(false);
  const [liveSpeechBlob,setLiveSpeechBlob]=useState<Blob|null>(null);
  const [liveSpeechUrl,setLiveSpeechUrl]=useState("");
  const [liveTranscript,setLiveTranscript]=useState("");
  const [liveSpeechMessage,setLiveSpeechMessage]=useState("");
  const [privateCode,setPrivateCode]=useState("");
  const [privateRoom,setPrivateRoom]=useState<PrivateRoomData|null>(null);
  const [privateBusy,setPrivateBusy]=useState(false);
  const [privateNotice,setPrivateNotice]=useState("");
  const queueChannelRef=useRef<any>(null);
  const liveChannelRef=useRef<any>(null);
  const timeoutSentRef=useRef(false);
  const matchedOnceRef=useRef(false);
  const liveAssignmentInFlightRef=useRef(false);
  const submittedLiveAssignmentRef=useRef("");
  const liveXpAwardsRef=useRef(new Set<string>());
  const initialLiveEloRef=useRef<number|null>(null);
  const refreshedLiveRatingRef=useRef("");
  const assignmentSubmitInFlightRef=useRef(false);
  const autoSubmissionAttemptedRef=useRef(false);
  const queueGenerationRef = useRef(0);
  const joiningQueueRef = useRef(false);
  const matchPollRef=useRef<number|undefined>(undefined);
  const matchClockRef=useRef<number|undefined>(undefined);
  const privatePollRef=useRef<number|undefined>(undefined);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const streamRef=useRef<MediaStream|null>(null);
  const speechTimeoutRef=useRef<number|undefined>(undefined);
  const captureGenerationRef=useRef(0);
  const aiTurnSubmitRef=useRef(false);
  const historyNavigationRef=useRef(false);
  const liveGeneration = useRef(0);
  const restoredRoomOwner = useRef<string | null>(null);
  const workspaceOwner = useRef<string | null | undefined>(undefined);
  const assessmentGeneration = useRef(0);

  useEffect(() => {
    if (!auth) return;
    auth.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user.email ?? null);
      setSessionAccountId(data.session?.user.id ?? null);
    });
    const { data } = auth.auth.onAuthStateChange((event, session) => {
      setSessionEmail(session?.user.email ?? null);
      setSessionAccountId(session?.user.id ?? null);
      setEvidencePractice(previous => previous?.accountId === session?.user.id ? previous : null);
      if (event === "PASSWORD_RECOVERY") { setGuestMode(false); setMode("reset"); }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!progressOwner) { setProgressReadyForOwner(false); return; }
    setProgressReadyForOwner(false);
    progressOwnerRef.current = progressOwner;
    setProgressState(loadProgress(localStorage, progressOwner));
    setProgressReadyForOwner(true);
  }, [progressOwner]);

  useEffect(() => {
    const owner = sessionAccountId ?? (guestMode ? "guest" : null);
    if (owner === null && workspaceOwner.current === undefined) return;
    const previous = workspaceOwner.current;
    workspaceOwner.current = owner;
    if (previous === undefined || previous === owner) return;
    liveGeneration.current++;
    assessmentGeneration.current++;
    refereeInFlight.current = false; setAssessmentBusy(false);
    restoredRoomOwner.current = null; matchedOnceRef.current = false;
    stopQueueTimers(); cancelSpeechCapture();
    if (auth && liveChannelRef.current) { void auth.removeChannel(liveChannelRef.current); liveChannelRef.current = null; }
    setLiveRoom(null); setLiveUid(""); setLiveDraft(""); setLiveTranscript(""); setPlaybackUrls({});
    setDebateTurns([]); setDebateDraft(""); setDebateVerdict(null); setDebatePlan(null); setEvidencePractice(null);
    setProfile({ displayName:null, elo:null, wins:0, losses:0, ties:0, avatarPath:null, avatarUrl:null });
    setProfileReady(false); setAssignedPractice(null); setView("home");
  }, [sessionAccountId, guestMode]);

  const workspaceOpen = Boolean((sessionEmail && mode !== "reset") || guestMode);
  useEffect(() => {
    if (!workspaceOpen) return;
    window.history.replaceState({ ...window.history.state, veritasView: viewRef.current }, "", destinationUrl(viewRef.current, new URLSearchParams(window.location.search).get("room") ?? undefined));
    const onPopState = (event: PopStateEvent) => {
      const next = event.state?.veritasView ?? initialDestination();
      if (!viewValues.includes(next)) return;
      const destination = safeDestination(next);
      if (destination !== next) window.history.replaceState({ ...window.history.state, veritasView: destination }, "", destinationUrl(destination));
      if (destination === "live-room") {
        const room = new URLSearchParams(window.location.search).get("room");
        if (room && room !== liveRoom?.id) { matchedOnceRef.current = false; void onMatched(room); }
      }
      historyNavigationRef.current = destination !== viewRef.current;
      if (viewRef.current === "game") setAssignedPractice(null);
      setView(destination);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [workspaceOpen]);

  useEffect(() => {
    if (!workspaceOpen) return;
    if (historyNavigationRef.current) {
      historyNavigationRef.current = false;
      return;
    }
    if (window.history.state?.veritasView !== view) {
      window.history.pushState({ ...(window.history.state || {}), veritasView: view }, "", destinationUrl(view, liveRoom?.id));
    }
  }, [view, workspaceOpen, liveRoom?.id]);

  useEffect(() => {
    const active = workspaceOpen && (view === "game" || view === "ai-room" || view === "live-room");
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [view, workspaceOpen]);

  useEffect(() => {
    const session = practiceKey ? readPracticeSession(practiceKey) : null;
    setSavedPractice(practiceKey && session ? { key: practiceKey, session } : null);
    if (viewRef.current === "game" && activePracticeKey.current !== practiceKey) {
      setAssignedPractice(null);
      setView("home");
    }
  }, [practiceKey]);

  useEffect(() => {
    if (!practiceKey || activePracticeKey.current !== practiceKey || view !== "game" || !questions.length) return;
    const saved: SavedPracticeSession = {
      mode: activeMode,
      difficulty,
      questions,
      questionIndex,
      answers,
      streak: streakNow,
      bestStreak,
      score,
      currentAnswer,
      daily: isDailyRun,
      dailyDate, speedLimit, speedRemainingMs: speedRemaining.current,
      baseline: isBaselineRun,
      attempt,
      assignedPractice,
      savedAt: new Date().toISOString(),
    };
    try { sessionStorage.setItem(practiceKey, JSON.stringify(saved)); } catch { /* Resume remains available in memory. */ }
    setSavedPractice({ key: practiceKey, session: saved });
  }, [practiceKey, view, activeMode, difficulty, questions, questionIndex, answers, streakNow, bestStreak, score, currentAnswer, isDailyRun, dailyDate, speedLimit, speedSecondsLeft, isBaselineRun, attempt, assignedPractice]);

  useEffect(() => {
    if (view !== "daily") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    const limit = debatePracticeMode === "speech" ? speechSeconds + 180 : debateTurnSeconds;
    if (view !== "ai-room" || debateBusy || debateVerdict || debateTurnStartedAt === null || limit === 0) return;
    const timer = window.setInterval(() => setAiTurnNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [view, debateBusy, debateVerdict, debateTurnStartedAt, debatePracticeMode, speechSeconds, debateTurnSeconds]);

  useEffect(() => {
    const limit = debatePracticeMode === "speech" ? speechSeconds + 180 : debateTurnSeconds;
    if (view === "ai-room" && !debateBusy && !debateVerdict && debateTurnStartedAt !== null && limit > 0 && aiTurnNow - debateTurnStartedAt >= limit * 1000) {
      void submitAiArgument(null, true);
    }
  }, [aiTurnNow, view, debateBusy, debateVerdict, debateTurnStartedAt, debatePracticeMode, speechSeconds, debateTurnSeconds]);

  useEffect(() => {
    if (view !== "game" || activeMode !== "speed" || currentAnswer !== null) return;
    if (speedLimit === 0) return;
    const deadline = Date.now() + speedRemaining.current;
    let submitted = false;
    const update = () => {
      speedRemaining.current = Math.max(0, deadline - Date.now());
      setSpeedSecondsLeft(Math.ceil(speedRemaining.current / 1000));
      if (!speedRemaining.current && !submitted) { submitted = true; submitAnswer(-1); }
    };
    update();
    const timer = window.setInterval(update, 100);
    return () => {
      window.clearInterval(timer);
      speedRemaining.current = Math.max(0, deadline - Date.now());
    };
  }, [view, activeMode, questionIndex, currentAnswer, speedLimit]);

  useEffect(() => {
    if (!liveRoom || liveRoom.status !== "active") return;
    const updateClock = () => {
      const anchor = liveRoom.last_turn_at ? new Date(liveRoom.last_turn_at).getTime() : new Date(liveRoom.created_at).getTime();
      const remaining = Math.max(0, Math.ceil((anchor + liveRoom.turn_seconds * 1000 - Date.now()) / 1000));
      setLiveSecondsLeft(remaining);
      if (remaining === 0) void submitTimeoutTurn();
    };
    updateClock();
    const timer = window.setInterval(updateClock, 500);
    return () => window.clearInterval(timer);
  }, [liveRoom, liveUid]);

  useEffect(() => {
    if (!auth || !liveRoom) return;
    let cancelled = false;
    const refresh = async () => {
      const paths = [...new Set(liveRoom.turns.flatMap(turn => turn.audioPath ? [turn.audioPath] : []))];
      await Promise.all(paths.map(async path => {
        const { data } = await auth!.storage.from("debate-recordings").createSignedUrl(path, 600);
        if (!cancelled && data?.signedUrl) setPlaybackUrls(current => ({ ...current, [path]: data.signedUrl }));
      }));
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 240000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [liveRoom]);

  useEffect(() => () => {
    if (auth && liveChannelRef.current) void auth.removeChannel(liveChannelRef.current);
  }, []);

  useEffect(() => {
    setProfileReady(false);
    if (!auth || !sessionEmail) return;
    let active = true;
    void (async () => {
      try {
        const { data: userData } = await auth.auth.getUser();
        const user = userData.user;
        if (!user) return;
        const [{ data: row }, { data: savedProgress }] = await Promise.all([
          auth.from("profiles").select("display_name, elo_rating, wins, losses, ties").eq("uid", user.id).maybeSingle(),
          auth.rpc("get_my_profile_progress"),
        ]);
        if (!active) return;
        const remoteProgress = savedProgress && typeof savedProgress === "object" ? savedProgress : {};
        const localProgress = loadProgress(localStorage, user.id);
        const reconciled = mergeProgress(localProgress, remoteProgress);
        saveProgress(reconciled, localStorage, user.id);
        if (progressOwnerRef.current === user.id) {
          setProgressState(reconciled);
          setProgressReadyForOwner(true);
        }
        const avatarPath = typeof savedProgress?.avatarFileId === "string" ? savedProgress.avatarFileId : null;
        setProfile({ displayName: row?.display_name ?? null, elo: row?.elo_rating ?? null, wins: row?.wins ?? 0, losses: row?.losses ?? 0, ties: row?.ties ?? 0, avatarPath, avatarUrl: null });
        setProfileReady(true);
        if (avatarPath) {
          const { data } = await auth.storage.from("avatars").createSignedUrl(avatarPath, 3600);
          if (active && data?.signedUrl) {
            setProfile(current => current.avatarPath === avatarPath ? { ...current, avatarUrl: data.signedUrl } : current);
          }
        }
      } catch (cause) {
        if (active) setProfileMessage(cause instanceof Error ? cause.message : "Could not load your synced profile.");
      }
    })();
    return () => { active = false; };
  }, [sessionEmail]);

  useEffect(() => {
    const retry = () => setSyncAttempt(value => value + 1);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);

  useEffect(() => {
    if (!auth || !sessionEmail || guestMode || !profileReady || !progressReadyForOwner || progressOwner !== sessionAccountId || progressOwnerRef.current !== sessionAccountId) return;
    const saved = progress;
    void auth.rpc("sync_profile", { p_display_name: profile.displayName, p_progress: { totalXp:saved.totalXp, streak:saved.streak, totalRuns:saved.totalRuns, skills:saved.skills, masteryVersion:2, assessments:saved.assessments, modeStats:saved.modeStats, avatarFileId:profile.avatarPath } }).then(({error:syncError}:any) => {
      if (syncError) setProfileMessage("Progress is saved on this device. Account sync failed; retry here or reconnect to sync.");
      else setProfileMessage(previous => previous.startsWith("Progress is saved on this device.") ? "Progress synced to your account." : previous);
    });
  }, [sessionEmail, guestMode, profileReady, progressReadyForOwner, progressOwner, sessionAccountId, progress, profile.displayName, profile.avatarPath, syncAttempt]);

  useEffect(()=>{
    const previous=speechFlowRef.current;
    speechFlowRef.current={view,sessionEmail};
    const leftAiFlow=previous.view==="ai-room"&&(view!=="ai-room"||!sessionEmail);
    const leftLiveFlow=previous.view==="live-room"&&(view!=="live-room"||!sessionEmail);
    if(leftAiFlow||leftLiveFlow)cancelSpeechCapture();
  },[view,sessionEmail]);
  useEffect(()=>()=>{
    captureGenerationRef.current++;
    if(speechTimeoutRef.current)window.clearTimeout(speechTimeoutRef.current);
    const recorder=recorderRef.current;
    if(recorder?.state==="recording"){recorder.ondataavailable=null;recorder.onstop=null;try{recorder.stop();}catch{}}
    streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;
  },[]);
  useEffect(()=>()=>{stopQueueTimers();if(auth&&queueChannelRef.current)void auth.removeChannel(queueChannelRef.current);},[]);
  useEffect(()=>{
    if(!sessionAccountId||!pendingAssignmentResult||pendingAssignmentResult.owner_id!==sessionAccountId||autoSubmissionAttemptedRef.current)return;
    autoSubmissionAttemptedRef.current=true;
    void submitAssignedResult(pendingAssignmentResult.assignment,pendingAssignmentResult.content,pendingAssignmentResult.activity);
  },[sessionAccountId]);
  useEffect(()=>{
    if(!liveRoom||liveRoom.status!=="completed"||!liveUid)return;
    awardLiveDebateXpOnce(liveRoom.id,"completion",60);
    if(liveRoom.ai_verdict?.winnerUid===liveUid)awardLiveDebateXpOnce(liveRoom.id,"winner",40);
    if(liveRoom.ai_verdict&&!liveRoom.is_private&&refreshedLiveRatingRef.current!==liveRoom.id){
      refreshedLiveRatingRef.current=liveRoom.id;
      void refreshLiveRating();
    }
  },[liveRoom?.id,liveRoom?.status,liveRoom?.ai_verdict?.winnerUid,liveRoom?.ai_verdict,liveUid]);
  useEffect(()=>{
    if(!liveRoom||liveRoom.status!=="completed"||!assignedPractice||!(["live_debate","private_debate"].includes(assignedPractice.kind)))return;
    if(submittedLiveAssignmentRef.current===liveRoom.id||liveAssignmentInFlightRef.current)return;
    void submitLiveAssignment(liveRoom);
  },[liveRoom,assignedPractice]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!auth) return setError("Supabase is not configured. Add the NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY values to this app's .env.local file.");
    setBusy(true);
    try {
      if (mode === "login") {
        const { error: result } = await auth.auth.signInWithPassword({ email, password });
        if (result) throw result;
      } else if (mode === "signup") {
        const { data, error: result } = await auth.auth.signUp({ email, password });
        if (result) throw result;
        if (!data.session) setMessage("Check your email to confirm your account, then sign in.");
      } else if (mode === "forgot") {
        const { error: result } = await auth.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (result) throw result;
        setMessage("If an account exists for that address, a password reset link is on its way.");
      } else {
        if (password !== confirmPassword) throw new Error("The passwords do not match.");
        const { error: result } = await auth.auth.updateUser({ password });
        if (result) throw result;
        setMode("login");
        setPassword("");
        setConfirmPassword("");
        setNotice("Your password has been updated.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!auth) return;
    clearPendingAssignment();
    const { error: result } = await auth.auth.signOut();
    if (result) setError(result.message);
  }

  function clearPendingAssignment() {
    try {
      sessionStorage.removeItem(pendingAssignmentStorageKey);
      if (pendingAssignmentResult?.assignment?.id) sessionStorage.removeItem(`veritas-react-submit:${pendingAssignmentResult.assignment.id}`);
    } catch { /* Storage may be unavailable. */ }
    setPendingAssignmentResult(null);
    setAssignedPractice(null);
  }

  function startPracticeRun(mode: PracticeMode, selectedDifficulty: "all" | Difficulty, isRetry = false, questionLimit = 8, baseline = false, classroomAssignment?: Assignment) {
    const sourceBank = classroomAssignment ? assignmentQuestionBanks[mode] : practiceQuestionBanks[mode];
    setAssignedPractice(classroomAssignment ?? null);
    const timeLimit = classroomAssignment ? 5 : speedLimit;
    setSpeedLimit(timeLimit);
    const source = selectedDifficulty === "all" ? sourceBank : sourceBank.filter(q => q.difficulty === selectedDifficulty);
    if (!source.length) return setNotice("There are no questions at that difficulty yet.");
    const attemptNo = isRetry ? attempt + 1 : 1;
    activePracticeKey.current = practiceKey;
    setAttempt(attemptNo);
    const random = seededRandom(`${new Date().toISOString().slice(0,10)}-${mode}-${selectedDifficulty}-${attemptNo}`);
    const prioritized = prioritizeAssessment(shuffled(source, random), practiceModeInfo(mode).skill, progress.assessments);
    const picked = prioritized.slice(0, Math.min(questionLimit, prioritized.length)).map(question => shuffledOptions(question, random));
    setActiveMode(mode);
    setQuestions(picked);
    setDifficulty(selectedDifficulty);
    setQuestionIndex(0);
    setAnswers([]);
    setStreakNow(0);
    setBestStreak(0);
    setScore(0);
    setCurrentAnswer(null);
    speedRemaining.current = timeLimit * 1000;
    setSpeedSecondsLeft(timeLimit);
    setDailyDate(undefined);
    setIsDailyRun(false);
    setIsBaselineRun(baseline);
    setView("game");
    setNotice("");
  }

  function resumePracticeRun() {
    if (!resumeSession || !practiceKey) return;
    activePracticeKey.current = practiceKey;
    setActiveMode(resumeSession.mode);
    setDifficulty(resumeSession.difficulty);
    setQuestions(resumeSession.questions);
    setQuestionIndex(resumeSession.questionIndex);
    setAnswers(resumeSession.answers);
    setStreakNow(resumeSession.streak);
    setBestStreak(resumeSession.bestStreak);
    setScore(resumeSession.score);
    setCurrentAnswer(resumeSession.currentAnswer);
    setDailyDate(resumeSession.dailyDate ?? (resumeSession.daily ? resumeSession.savedAt.slice(0,10) : undefined));
    setSpeedLimit(resumeSession.speedLimit ?? 5);
    speedRemaining.current = resumeSession.speedRemainingMs ?? 5000;
    setSpeedSecondsLeft(Math.ceil(speedRemaining.current / 1000));
    setIsDailyRun(resumeSession.daily);
    setIsBaselineRun(Boolean(resumeSession.baseline));
    setAttempt(resumeSession.attempt || 1);
    setAssignedPractice(resumeSession.assignedPractice || null);
    setView("game");
    setNotice("");
  }

  function pausePracticeRun() {
    if (practiceKey && savedPractice?.key === practiceKey) {
      const session = { ...savedPractice.session, speedRemainingMs: speedRemaining.current };
      try { sessionStorage.setItem(practiceKey, JSON.stringify(session)); } catch { /* Memory resume still works. */ }
      setSavedPractice({ key: practiceKey, session });
    }
    setAssignedPractice(null);
    setView("home");
    setNotice("Practice paused. Resume it from your dashboard.");
  }

  function clearSavedPractice() {
    try {
      if (practiceKey) sessionStorage.removeItem(practiceKey);
    } catch { /* Session is still cleared in memory. */ }
    activePracticeKey.current = null;
    setSavedPractice(null);
  }

  function discardPracticeRun() {
    clearSavedPractice();
    setQuestions([]);
    setAnswers([]);
    setAssignedPractice(null);
    setView("home");
    setNotice("Practice session ended.");
  }

  function startDailyChallenge() {
    const day = utcDay();
    if (progress.dailyCompletedDate === day) return;
    activePracticeKey.current = practiceKey;
    setAttempt(1);
    setAssignedPractice(null);
    const dayIndex = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86400000);
    const mode = practiceModes[((dayIndex % practiceModes.length) + practiceModes.length) % practiceModes.length].id;
    const random = seededRandom(`daily-${day}-${mode}`);
    const pool = shuffled(practiceQuestionBanks[mode], random).slice(0, 4).map(question => shuffledOptions(question, random));
    setActiveMode(mode);
    setQuestions(pool);
    setDifficulty("all");
    setQuestionIndex(0);
    setAnswers([]);
    setStreakNow(0);
    setBestStreak(0);
    setScore(0);
    setCurrentAnswer(null);
    speedRemaining.current = speedLimit * 1000;
    setSpeedSecondsLeft(speedLimit);
    setDailyDate(day);
    setIsDailyRun(true);
    setIsBaselineRun(false);
    setView("game");
  }

  function submitAnswer(answerIndex: number) {
    if (currentAnswer !== null) return;
    const question = questions[questionIndex];
    if (!question) return;
    const correct = answerIndex === question.correct;
    const nextStreak = correct ? streakNow + 1 : 0;
    const mult = correct ? (nextStreak >= 6 ? 2.5 : nextStreak >= 4 ? 2 : nextStreak >= 2 ? 1.5 : 1) : 1;
    const points = correct ? Math.round((question.difficulty === "hard" ? 30 : question.difficulty === "medium" ? 20 : 12) * mult) : 0;
    setAnswers([...answers, { id: question.id, answer: answerIndex, prompt: question.prompt, difficulty: question.difficulty, correct, tip: question.tip }]);
    setCurrentAnswer(answerIndex);
    setStreakNow(nextStreak);
    setBestStreak(Math.max(bestStreak, nextStreak));
    setScore(score + points);
  }

  function finishFallacyRun(runAnswers: AnswerRecord[], finalScore: number, finalStreak: number, daily = false) {
    const correct = runAnswers.filter(a => a.correct).length;
    const total = runAnswers.length;
    const accuracy = Math.round((correct / total) * 100);
    const modeInfo = practiceModeInfo(activeMode);
    const assessedResult = recordAssessment(progress.assessments, modeInfo.skill, runAnswers);
    const skills = assessedResult.scores as Record<string, number>;
    const previous = progress.skills?.[modeInfo.skill] || 0;
    const skillGain = (skills[modeInfo.skill] || 0) - previous;
    const prevMode = progress.modeStats[activeMode] || { bestPct: 0, plays: 0, bestScore: 0 };
    const baseXp = Math.round(modeInfo.xp * correct / total);
    const accuracyBonus = accuracy >= 80 ? 30 : accuracy >= 50 ? 12 : 0;
    const streakBonus = finalStreak >= 4 ? 30 : finalStreak >= 2 ? 12 : 0;
    const completionDate = dailyDate ?? utcDay();
    const latestProgress = loadProgress(localStorage, progressOwner || "guest");
    const alreadyRewarded = daily && !dailyRewardAvailable(latestProgress.dailyCompletedDate, completionDate);
    const xp = alreadyRewarded ? 0 : (baseXp + accuracyBonus + streakBonus) * (daily ? 3 : 1);
    const today = new Date().toISOString().slice(0,10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    const next = {
      ...progress,
      totalXp: progress.totalXp + xp,
      totalRuns: progress.totalRuns + 1,
      streak: progress.lastPlayDate === today ? progress.streak : progress.lastPlayDate === yesterday ? progress.streak + 1 : 1,
      lastPlayDate: today,
      dailyCompletedDate: daily ? completedDailyDate(progress.dailyCompletedDate, dailyDate ?? today) : progress.dailyCompletedDate,
      modeStats: { ...progress.modeStats, [activeMode]: { bestPct: Math.max(prevMode.bestPct, accuracy), plays: prevMode.plays + 1, bestScore: Math.max(prevMode.bestScore, finalScore), lastPlayedAt: new Date().toISOString() } },
      assessments: assessedResult.records,
      skills,
      activity: { ...progress.activity, [today]: (progress.activity[today] || 0) + 1 },
      bestCombo: Math.max(progress.bestCombo || 0, finalStreak),
    };
    const arcadeRun = { modeKey: activeMode, correct, accuracy, bestCombo: finalStreak, score: finalScore, isDaily: daily };
    const arcade = applyArcadeRun(next, today, arcadeRun);
    const saved = arcade.state;
    saveProgress(saved, localStorage, progressOwner || "guest");
    setProgressState(saved);
    const completedAssignment = assignedPractice;
    if (completedAssignment) {
      const activity = { resultType: "server-scored", modeKey: activeMode, difficulty, correct, total, accuracy, score: finalScore, bestCombo: finalStreak,
        answers: classroomAnswers(activeMode, runAnswers, questions, assignmentQuestionBanks[activeMode]),
      };
      void submitAssignedResult(completedAssignment, JSON.stringify(activity), activity);
    }
    const recommended: Difficulty = accuracy < 50 ? "easy"
      : accuracy < 80 ? (difficulty === "all" ? "medium" : difficulty)
        : difficulty === "easy" ? "medium" : "hard";
    clearSavedPractice();
    setSummary({ correct, total, accuracy, score: finalScore, streak: finalStreak, xp: xp + arcade.completed.reduce((sum, quest) => sum + quest.xp, 0), skillGain, assessed: assessedResult.assessed, answers: runAnswers, recommended, daily, baseline: isBaselineRun, mode: activeMode });
    const rewardMessages = [
      ...arcade.completed.map(quest => `Goal complete: ${quest.text} (+${quest.xp} XP)`),
      ...arcade.unlocked.map(id => `Achievement unlocked: ${id.replaceAll("_", " ")}`),
    ];
    if (rewardMessages.length) setNotice(rewardMessages.join(" · "));
    setView("summary");
  }

  function advanceQuestion() {
    if (questionIndex + 1 < questions.length) {
      speedRemaining.current = speedLimit * 1000;
      setSpeedSecondsLeft(speedLimit);
      setQuestionIndex(questionIndex + 1);
      setCurrentAnswer(null);
    } else {
      finishFallacyRun(answers, score, bestStreak, isDailyRun);
    }
  }

  async function refreshLiveRating() {
    if(!auth||!liveUid)return;
    try{
      const {data,error}=await auth.from("profiles").select("elo_rating,wins,losses,ties").eq("uid",liveUid).maybeSingle();
      if(error||!data)return;
      const current=typeof data.elo_rating==="number"?data.elo_rating:null;
      const previous=initialLiveEloRef.current;
      if(current!==null){const delta=previous===null?null:current-previous;setLiveEloSummary(`Rating: ${current} ELO${delta===null?"":` (${delta>=0?"+":""}${delta})`}`);}
      setProfile(value=>({...value,elo:current,wins:data.wins??value.wins,losses:data.losses??value.losses,ties:data.ties??value.ties}));
    }catch{setMatchError("Debate finished, but the updated rating could not be loaded.");}
  }

  function awardLiveDebateXpOnce(debateId:string,reward:"completion"|"winner",amount:number) {
    if(!liveUid)return;
    const key=`veritas:live-debate-xp:${liveUid}:${debateId}:${reward}`;
    try{
      if(localStorage.getItem(key))return;
      localStorage.setItem(key,"1");
    }catch{
      if(liveXpAwardsRef.current.has(key))return;
      liveXpAwardsRef.current.add(key);
    }
    setProgressState((current:ReturnType<typeof loadProgress>)=>{
      const saved={...current,totalXp:current.totalXp+amount};
      saveProgress(saved, localStorage, progressOwner || "guest");
      return saved;
    });
    setNotice(`Live debate reward: +${amount} XP.`);
  }

  function awardStudyXp(amount: number) {
    const saved = { ...progress, totalXp: progress.totalXp + amount };
    saveProgress(saved, localStorage, progressOwner || "guest");
    setProgressState(saved);
    setNotice(`Study lesson completed. You earned ${amount} XP.`);
  }

  async function saveDisplayName() {
    const value = nameDraft.trim();
    if (value.length < 2 || value.length > 24) return setProfileMessage("Name must be 2–24 characters.");
    if (!/^[A-Za-z0-9 _.'-]+$/.test(value)) return setProfileMessage("Use letters, numbers, spaces, and . _ ' - only.");
    if (!auth || guestMode) return setProfileMessage("Sign in to save a synced display name.");
    setProfileBusy(true); setProfileMessage("");
    try {
      const saved = progress;
      const { error: result } = await auth.rpc("sync_profile", { p_display_name:value, p_progress:{ totalXp:saved.totalXp, streak:saved.streak, totalRuns:saved.totalRuns, skills:saved.skills, masteryVersion:2, assessments:saved.assessments, modeStats:saved.modeStats, avatarFileId:profile.avatarPath } });
      if (result) throw result;
      setProfile(p=>({...p,displayName:value})); setNameEditing(false); setProfileMessage("Display name saved to your account.");
    } catch (cause) { setProfileMessage(cause instanceof Error ? cause.message : "Couldn't save your name. Check your connection and try again."); }
    finally { setProfileBusy(false); }
  }

  async function uploadAvatar(file?: File) {
    if (!file) return;
    const accepted = ["image/png","image/jpeg","image/webp","image/gif"];
    if (!accepted.includes(file.type)) return setProfileMessage("Use a PNG, JPG, WEBP, or GIF image.");
    if (file.size > 5*1024*1024) return setProfileMessage("Image is too large. Maximum size is 5 MB.");
    if (!auth || guestMode) return setProfileMessage("Sign in before setting an avatar.");
    setProfileBusy(true); setProfileMessage("");
    try {
      const { data: userData, error: userError } = await auth.auth.getUser();
      if (userError || !userData.user) throw userError || new Error("Sign in before setting an avatar.");
      const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
      const path = `${userData.user.id}/avatar.${ext}`;
      const { error: uploadError } = await auth.storage.from("avatars").upload(path,file,{upsert:true,contentType:file.type,cacheControl:"3600"});
      if (uploadError) throw uploadError;
      const saved = progress;
      const { error: syncError } = await auth.rpc("sync_profile", { p_display_name:profile.displayName, p_progress:{ totalXp:saved.totalXp, streak:saved.streak, totalRuns:saved.totalRuns, skills:saved.skills, masteryVersion:2, assessments:saved.assessments, modeStats:saved.modeStats, avatarFileId:path } });
      if (syncError) throw syncError;
      const { data: signed } = await auth.storage.from("avatars").createSignedUrl(path,3600);
      setProfile(p=>({...p,avatarPath:path,avatarUrl:signed?.signedUrl??null})); setProfileMessage("Avatar updated.");
    } catch (cause) { setProfileMessage(cause instanceof Error ? cause.message : "Couldn't upload the avatar. Check the avatar storage setup and try again."); }
    finally { setProfileBusy(false); }
  }

  async function openLeaderboard(tab: "xp"|"elo" = "xp") {
    setView("leaderboard"); setLeaderTab(tab); setLeaderError("");
    if(tab!=="elo") return;
    if(!auth) { setLeaderError("Configure Supabase to load live debate ratings."); return; }
    setLeaderLoading(true);
    try {
      const {data,error:queryError}=await auth.from("profiles").select("uid, display_name, elo_rating, wins, losses, ties").or("wins.gt.0,losses.gt.0,ties.gt.0").order("elo_rating",{ascending:false}).limit(50);
      if(queryError)throw queryError;
      const {data:userData}=await auth.auth.getUser();
      setEloRows((data||[]).map((row:any)=>({name:row.display_name||"Debater",score:row.elo_rating||1200,self:row.uid===userData.user?.id,record:`${(row.wins||0)+(row.losses||0)+(row.ties||0)<5?"Provisional · ":""}${row.wins||0}W / ${row.losses||0}L / ${row.ties||0}T`})));
    } catch(cause) { setLeaderError(cause instanceof Error?cause.message:"Could not load live ratings. Check your connection."); }
    finally { setLeaderLoading(false); }
  }

  async function loadLiveTopics() {
    const fallback:HotTopic[]=[...aiTopicSamples];
    if(!auth){setLiveTopics(fallback);return;}
    try{const today=new Date().toISOString().slice(0,10);const {data}=await auth.from("hot_topics").select("topics").eq("date",today).maybeSingle();const rows=Array.isArray(data?.topics)?data.topics.filter((item:any)=>typeof item?.text==="string").map((item:any)=>({text:item.text,tag:item.tag||"Topic",newsUrl:typeof item.newsUrl==="string"&&item.newsUrl.startsWith("https://")?item.newsUrl:undefined,newsSource:typeof item.newsSource==="string"?item.newsSource:undefined})):[];setLiveTopics(rows.length?rows:fallback);}catch{setLiveTopics(fallback);}
  }

  async function openLiveLobby() {
    setView("live-lobby");setMatchError("");
    await loadLiveTopics();
  }

  function stopQueueTimers() {
    queueGenerationRef.current++;
    if(matchPollRef.current)window.clearInterval(matchPollRef.current);matchPollRef.current=undefined;
    if(matchClockRef.current)window.clearInterval(matchClockRef.current);matchClockRef.current=undefined;
  }

  async function leaveQueue() {
    stopQueueTimers();
    if(auth&&queueChannelRef.current){await auth.removeChannel(queueChannelRef.current);queueChannelRef.current=null;}
    try{await auth?.rpc("leave_training_queue");}catch{}
    setView("live-lobby");
  }

  async function joinPublicQueue(rematchFrom?:LiveRoomData) {
    if(!auth||guestMode){setMatchError("Sign in to find a live opponent.");return;}
    if (joiningQueueRef.current) return;
    joiningQueueRef.current = true;
    stopQueueTimers();
    const queueGeneration = queueGenerationRef.current;
    const topic=rematchFrom?.topic??liveTopic;
    const practiceMode=rematchFrom?.practice_mode??livePracticeMode;
    const turns=rematchFrom?.max_turns_per_player??liveTurns;
    const speechLength=rematchFrom?.speech_seconds??speechSeconds;
    initialLiveEloRef.current=profile.elo;setLiveEloSummary("");
    setMatchError("");setMatchSeconds(0);matchedOnceRef.current=false;
    try {
      if (queueChannelRef.current) { await auth.removeChannel(queueChannelRef.current); queueChannelRef.current = null; }
      const {data:userData,error:userError}=await auth.auth.getUser();if(userError||!userData.user)throw userError||new Error("Sign in to find a live opponent.");
      if (queueGeneration !== queueGenerationRef.current) return;
      const uid=userData.user.id;
      const channel=auth.channel(`queue-${uid}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"match_queue",filter:`uid=eq.${uid}`},payload=>{const row=payload.new as any;if(queueGeneration === queueGenerationRef.current && row?.status==="matched"&&row.debate_id)void onMatched(row.debate_id);}).subscribe();
      queueChannelRef.current=channel;
      const settings={mode:practiceMode,speech_seconds:speechLength,turns,topic:assignedPractice?.kind==="live_debate"?assignedPractice.activity_settings?.topic||assignedPractice.title:topic||"",drill_mode:"fallacy",difficulty:"all"};
      const {error:joinError}=await auth.rpc("join_training_queue",{p_topic:topic||null,p_settings:settings});if(joinError)throw joinError;
      if (queueGeneration !== queueGenerationRef.current) return;
      setView("live-search");
      let attempting = false;
      const attempt = async () => {
        if (attempting || queueGeneration !== queueGenerationRef.current) return;
        attempting = true;
        try {
          const fallback = topic || liveTopics[Math.floor(Math.random()*Math.max(liveTopics.length,1))]?.text || "Should public transport be free?";
          const { data, error } = await auth!.rpc("attempt_match", { p_fallback_topic: fallback });
          if (queueGeneration !== queueGenerationRef.current) return;
          if (error) throw error;
          if (data) { await onMatched(data as string); return; }
          const own = await auth!.from("match_queue").select("status,debate_id").eq("uid", uid).maybeSingle();
          if (queueGeneration !== queueGenerationRef.current) return;
          if (own.error) throw own.error;
          if (own.data?.status === "matched" && own.data.debate_id) { await onMatched(own.data.debate_id); return; }
          if (!own.data) { await leaveQueue(); setMatchError("You are no longer in the public queue. Check your live-practice preferences before joining again."); }
        } catch (cause) {
          if (queueGeneration === queueGenerationRef.current) setMatchError(cause instanceof Error ? cause.message : "Match search is retrying.");
        } finally { attempting = false; }
      };
      matchPollRef.current = window.setInterval(() => void attempt(), 2500);
      matchClockRef.current = window.setInterval(() => setMatchSeconds(seconds => seconds + 1), 1000);
      await attempt();
    } catch(cause){if(queueGeneration !== queueGenerationRef.current)return;if(auth&&queueChannelRef.current){await auth.removeChannel(queueChannelRef.current);queueChannelRef.current=null;}setMatchError(cause instanceof Error?cause.message:"Could not join the match queue.");setView("live-lobby");}
    finally { joiningQueueRef.current = false; }
  }

  useEffect(() => {
    if (!workspaceOpen || !sessionAccountId || restoredRoomOwner.current === sessionAccountId) return;
    restoredRoomOwner.current = sessionAccountId;
    if (viewRef.current !== "live-room") return;
    let room = new URLSearchParams(window.location.search).get("room");
    try { room ||= sessionStorage.getItem(`veritas:active-room:${sessionAccountId}`); } catch { /* URL is enough. */ }
    if (room) { matchedOnceRef.current = false; void onMatched(room); }
    else setView("live-lobby");
  }, [workspaceOpen, sessionAccountId]);

  useEffect(() => {
    if (!auth || !liveRoom || view !== "live-room") return;
    let active = true;
    const reconcile = async () => {
      const { data, error } = await auth!.from("debates").select("*").eq("id", liveRoom.id).single();
      if (!active) return;
      if (error) { setMatchError("Connection interrupted. Reconnecting to your debate…"); return; }
      setLiveRoom(current => current && current.id === data.id && (current.turn_index > data.turn_index || (current.ai_verdict && !data.ai_verdict)) ? current : data as LiveRoomData);
    };
    const visible = () => { if (document.visibilityState === "visible") void reconcile(); };
    window.addEventListener("online", reconcile);
    document.addEventListener("visibilitychange", visible);
    const timer = window.setInterval(() => void reconcile(), 5000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("online", reconcile); document.removeEventListener("visibilitychange", visible); };
  }, [view, liveRoom?.id]);

  async function onMatched(debateId:string) {
    if(matchedOnceRef.current)return;matchedOnceRef.current=true;
    const generation = ++liveGeneration.current;
    stopQueueTimers();if(auth&&queueChannelRef.current){await auth.removeChannel(queueChannelRef.current);queueChannelRef.current=null;}
    setLiveRoom(null);setMatchedDebateId(debateId);setView("live-room");setLiveRoomLoading(true);setLiveDraft("");setLiveTranscript("");setLiveSpeechBlob(null);setLiveSpeechMessage("");setLiveRatingSent(false);timeoutSentRef.current=false;
    try {
      const {data:userData,error:userError}=await auth!.auth.getUser();if(userError||!userData.user)throw userError||new Error("Sign in again to open this match.");setLiveUid(userData.user.id);
      const {data,error:roomError}=await auth!.from("debates").select("*").eq("id",debateId).single();if(roomError||!data)throw roomError||new Error("Debate room not found.");
      if (generation !== liveGeneration.current) return;
      try { sessionStorage.setItem(`veritas:active-room:${userData.user.id}`, debateId); } catch { /* URL recovery remains available. */ }
      window.history.replaceState({ ...window.history.state, veritasView: "live-room" }, "", destinationUrl("live-room", debateId));
      setLiveRoom(data as LiveRoomData);setLiveOpponentName("Opponent");setLiveOpponentElo(1200);
      const opponent=(data as LiveRoomData).players.find((id:string)=>id!==userData.user.id);
      if(opponent){const {data:profileRow}=await auth!.from("profiles").select("display_name,elo_rating").eq("uid",opponent).maybeSingle();if(profileRow?.display_name)setLiveOpponentName(profileRow.display_name);if(typeof profileRow?.elo_rating==="number")setLiveOpponentElo(profileRow.elo_rating);}
      if(liveChannelRef.current)await auth!.removeChannel(liveChannelRef.current);
      liveChannelRef.current=auth!.channel(`debate-${debateId}`).on("postgres_changes",{event:"UPDATE",schema:"public",table:"debates",filter:`id=eq.${debateId}`},payload=>{
        if (generation !== liveGeneration.current) return;
        const row = payload.new as LiveRoomData;
        setLiveRoom(current => current && current.id === row.id && (current.turn_index > row.turn_index || (current.ai_verdict && !row.ai_verdict)) ? current : row);
        timeoutSentRef.current=false;
      }).subscribe(async status => {
        if (status !== "SUBSCRIBED" || generation !== liveGeneration.current) return;
        const { data: fresh } = await auth!.from("debates").select("*").eq("id", debateId).single();
        if (fresh && generation === liveGeneration.current) setLiveRoom(current => current && current.id === fresh.id && (current.turn_index > fresh.turn_index || (current.ai_verdict && !fresh.ai_verdict)) ? current : fresh as LiveRoomData);
      });
    }catch(cause){matchedOnceRef.current=false;setMatchError(cause instanceof Error?cause.message:"Could not load this debate room.");}
    finally{setLiveRoomLoading(false);}
  }

  async function submitLiveTurn(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!auth||!liveRoom||liveSending)return;const text=(liveRoom.practice_mode==="speech"?liveTranscript:liveDraft).trim();if(text.length<12)return setMatchError("Write or record a complete argument before sending.");
    setLiveSending(true);setMatchError("");
    let audioPath:string|null=null;
    try{if(liveRoom.practice_mode==="speech"){
        if(!liveSpeechBlob)throw new Error("Record and review your speech before sending this turn.");
        const ext=liveSpeechBlob.type==="audio/mp4"?"m4a":liveSpeechBlob.type==="audio/ogg"?"ogg":"webm";audioPath=`${liveUid}/${crypto.randomUUID()}.${ext}`;
        const {error:uploadError}=await auth.storage.from("debate-recordings").upload(audioPath,liveSpeechBlob,{contentType:liveSpeechBlob.type,upsert:false});if(uploadError)throw uploadError;
        const {error:registerError}=await auth.rpc("register_debate_recording",{p_path:audioPath,p_debate_id:liveRoom.id,p_assignment_id:null});if(registerError){await auth.storage.from("debate-recordings").remove([audioPath]);throw registerError;}
      }
      const {error}=await auth.rpc("submit_training_turn",{p_debate_id:liveRoom.id,p_text:text,p_audio_path:audioPath,p_expected_turn:liveRoom.turn_index});if(error)throw error;setLiveDraft("");setLiveTranscript("");setLiveSpeechBlob(null);setLiveSpeechMessage("");}
    catch(cause){setMatchError(cause instanceof Error?cause.message:"Your turn could not be submitted. Refresh and try again.");}
    finally{setLiveSending(false);}
  }

  async function startLiveRecording() {
    if(!auth||!liveRoom||liveRoom.practice_mode!=="speech"||liveRecording||liveSpeechBusy)return;
    if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){setLiveSpeechMessage("This browser cannot record audio. Try another supported browser.");return;}
    const generation=++captureGenerationRef.current;
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(generation!==captureGenerationRef.current||viewRef.current!=="live-room"){stream.getTracks().forEach(track=>track.stop());return;}
      streamRef.current=stream;
      const mimeType=["audio/webm;codecs=opus","audio/ogg;codecs=opus","audio/mp4"].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mimeType)throw new Error("No supported recording format is available in this browser.");
      const recorder=new MediaRecorder(stream,{mimeType});recorderRef.current=recorder;const chunks:BlobPart[]=[];let bytes=0;
      recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);bytes+=event.data.size;if(bytes>10*1024*1024)recorder.stop();}};
      recorder.onstop=()=>{
        if(speechTimeoutRef.current){window.clearTimeout(speechTimeoutRef.current);speechTimeoutRef.current=undefined;}
        stream.getTracks().forEach(track=>track.stop());if(streamRef.current===stream)streamRef.current=null;
        if(generation!==captureGenerationRef.current)return;
        recorderRef.current=null;setLiveRecording(false);
        const blob=new Blob(chunks,{type:mimeType.split(";")[0]});
        if(!blob.size){setLiveSpeechMessage("The recording was empty. Try again.");return;}
        if(liveSpeechUrl)URL.revokeObjectURL(liveSpeechUrl);setLiveSpeechBlob(blob);setLiveSpeechUrl(URL.createObjectURL(blob));setLiveSpeechBusy(true);setLiveSpeechMessage("Transcribing speech for review…");
        const reader=new FileReader();
        reader.onload=async()=>{
          if(generation!==captureGenerationRef.current)return;
          try{
            const encoded=String(reader.result).split(",")[1];
            const data=await invokeVeritasFunction("ai-debate",{action:"transcribe",audio:encoded,mimeType:blob.type});
            if(generation!==captureGenerationRef.current)return;
            if(data?.ok!==true||typeof data.text!=="string"||!data.text.trim())throw new Error("No speech transcript was returned.");
            setLiveTranscript(data.text.slice(0,8000));setLiveSpeechMessage("Review the transcript before sending your turn.");
          }catch(cause){if(generation===captureGenerationRef.current)setLiveSpeechMessage(cause instanceof Error?cause.message:"Transcription failed. You can type your transcript below.");}
          finally{if(generation===captureGenerationRef.current)setLiveSpeechBusy(false);}
        };
        reader.onerror=()=>{if(generation===captureGenerationRef.current){setLiveSpeechBusy(false);setLiveSpeechMessage("Could not read this recording. Try again.");}};
        reader.readAsDataURL(blob);
      };
      recorder.start(1000);setLiveRecording(true);setLiveSpeechBlob(null);setLiveTranscript("");setLiveSpeechMessage(`Recording for up to ${liveRoom.speech_seconds} seconds.`);
      speechTimeoutRef.current=window.setTimeout(()=>{if(recorder.state==="recording")recorder.stop();},liveRoom.speech_seconds*1000);
    }catch(cause){streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;if(generation===captureGenerationRef.current)setLiveSpeechMessage(cause instanceof Error?cause.message:"Microphone permission is required to record.");}
  }

  async function submitTimeoutTurn() {
    if(!auth||!liveRoom||timeoutSentRef.current||liveRoom.status!=="active")return;
    const whose=liveRoom.player_order[liveRoom.turn_index%2];if(whose!==liveUid)return;timeoutSentRef.current=true;
    if(liveRecording||liveSpeechBusy)cancelSpeechCapture();
    setLiveSpeechBlob(null);setLiveTranscript("");setLiveDraft("");
    try{const {error}=await auth.rpc("submit_timeout_turn",{p_debate_id:liveRoom.id});if(error)throw error;}
    catch(cause){timeoutSentRef.current=false;setMatchError(cause instanceof Error?cause.message:"Timeout could not be recorded.");}
  }

  async function rateLiveDebate(rating:"up"|"down") {
    if(!auth||!liveRoom||liveRatingSent)return;setLiveRatingSent(true);
    const {error}=await auth.rpc("submit_rating",{p_debate_id:liveRoom.id,p_rating:rating});if(error){setLiveRatingSent(false);setMatchError(error.message);}
  }

  async function submitLiveAssignment(room:LiveRoomData) {
    if(!auth||!assignedPractice||!(["live_debate","private_debate"].includes(assignedPractice.kind)))return;
    liveAssignmentInFlightRef.current=true;setLiveAssignmentStatus("Saving your completed debate to Classroom…");
    try{
      const content=room.turns.map(turn=>`${turn.uid===liveUid?"You":liveOpponentName}: ${turn.text}`).join("\n").slice(0,30000);
      const result=await submitAssignedResult(assignedPractice,content,{id:room.id});
      if(result.ok){submittedLiveAssignmentRef.current=room.id;setLiveAssignmentStatus("Assigned debate submitted to your classroom.");}
      else setLiveAssignmentStatus(`Debate complete, but Classroom could not save it: ${result.message}`);
    }catch(cause){setLiveAssignmentStatus(`Debate complete, but Classroom could not save it: ${cause instanceof Error?cause.message:"network error"}`);}
    finally{liveAssignmentInFlightRef.current=false;}
  }

  async function createPrivateRoom(rematchFrom?:LiveRoomData) {
    if(!auth||guestMode){setPrivateNotice("Sign in to create a private room.");return;}
    const topic=rematchFrom?.topic??liveTopic;
    const practiceMode=rematchFrom?.practice_mode??livePracticeMode;
    const turns=rematchFrom?.max_turns_per_player??liveTurns;
    const speechLength=rematchFrom?.speech_seconds??speechSeconds;
    if(rematchFrom){setLiveTopic(topic);setLivePracticeMode(practiceMode as "written"|"speech");setLiveTurns(turns);setSpeechSeconds(speechLength);setPrivateRoom(null);setPrivateCode("");setView("live-lobby");}
    matchedOnceRef.current=false;setPrivateBusy(true);setPrivateNotice("");
    try{const {data,error}=await auth.rpc("create_private_debate_room",{p_assignment_id:assignedPractice?.kind==="private_debate"?assignedPractice.id:null,p_topic:assignedPractice?.activity_settings?.topic||assignedPractice?.title||topic||"Should public transport be free?",p_settings:{mode:practiceMode,speech_seconds:speechLength,turns,turn_seconds:180}});if(error)throw error;const room=data as PrivateRoomData;setPrivateRoom(room);setPrivateCode(room.code);setPrivateNotice(`Room ${room.code} is ready. Share the code with your partner.`);startPrivateRoomPolling(room.id);}
    catch(cause){setPrivateNotice(cause instanceof Error?cause.message:"Could not create the room.");}finally{setPrivateBusy(false);}
  }

  async function joinPrivateRoom() {
    if(!auth||guestMode){setPrivateNotice("Sign in to join a private room.");return;}
    if(!privateCode.trim()){setPrivateNotice("Enter the room code from your partner.");return;}
    matchedOnceRef.current=false;setPrivateBusy(true);setPrivateNotice("");
    try{const {data,error}=await auth.rpc("join_private_debate_room",{p_code:privateCode.trim().toUpperCase(),p_assignment_id:assignedPractice?.kind==="private_debate"?assignedPractice.id:null});if(error)throw error;const room=data as PrivateRoomData;setPrivateRoom(room);setPrivateCode(room.code);setPrivateNotice("Joined the room. Opening the debate…");if(room.debate_id)void onMatched(room.debate_id);else startPrivateRoomPolling(room.id);}
    catch(cause){setPrivateNotice(cause instanceof Error?cause.message:"Could not join that room.");}finally{setPrivateBusy(false);}
  }

  function startPrivateRoomPolling(roomId:string) {
    if(privatePollRef.current)window.clearInterval(privatePollRef.current);
    privatePollRef.current=window.setInterval(async()=>{if(!auth)return;const {data,error}=await auth.from("private_debate_rooms").select("*").eq("id",roomId).maybeSingle();if(error){setPrivateNotice("Connection interrupted. The room code is still available.");return;}if(!data)return;setPrivateRoom(data as PrivateRoomData);if(data.debate_id){window.clearInterval(privatePollRef.current);privatePollRef.current=undefined;void onMatched(data.debate_id);}else if(data.closed||new Date(data.expires_at).getTime()<Date.now()){window.clearInterval(privatePollRef.current);privatePollRef.current=undefined;setPrivateNotice("This room has expired. Create another room or use a fresh code.");}},2000);
  }

  function beginAiDebate() {
    if (refereeInFlight.current) { setNotice("Wait for the current assessment before starting another debate."); return; }
    if (!auth || !sessionEmail) { setDebateError("Sign in to debate the AI."); return; }
    const topic = debateTopic.trim();
    if (!topic || topic.length > 200) {
      setDebateError(topic ? "Use a debate motion of 200 characters or fewer." : "Enter a topic to start the debate.");
      return;
    }
    uploadedSpeech.current = null;
    setDebateTurns([]);setDebateDraft("");setDebateError("");setDebateVerdict(null);setDebateEstimated(false);setDevilDraft("");setDevilBusy(false);setDevilError("");setDevilResult(null);setAiAssignmentStatus("");setAiAssignmentTranscript([]);setSpeechBlob(null);setSpeechUrl("");setPlaybackUrls({});setAiTurnNow(Date.now());setDebateTurnStartedAt(Date.now());aiTurnSubmitRef.current=false;setView("ai-room");
  }

  async function submitAssignedResult(assignment: Assignment, content: string, activity: Record<string, any>) {
    if (!auth) return { ok: false, message: "Connect Supabase before submitting this assignment." };
    if (assignmentSubmitInFlightRef.current) return { ok: false, message: "Classroom submission is already in progress." };
    const key = `veritas-react-submit:${assignment.id}`;
    const stored = readPendingAssignmentResult();
    if (stored && stored.owner_id !== progressOwner) return { ok: false, message: "This submission belongs to another account. Sign in to that account to retry it." };
    if (stored && stored.assignment.id !== assignment.id) return { ok: false, message: "Submit or retry the previous assignment before starting another." };
    const requestId = stored?.request_id || sessionStorage.getItem(key) || crypto.randomUUID();
    if (!progressOwner) return { ok: false, message: "Sign in before submitting this assignment." };
    const pending = stored || { owner_id: progressOwner, assignment, request_id: requestId, content, activity };
    sessionStorage.setItem(key, pending.request_id);
    sessionStorage.setItem(pendingAssignmentStorageKey, JSON.stringify(pending));
    setPendingAssignmentResult(pending);
    assignmentSubmitInFlightRef.current = true;
    try {
      const { error } = await auth.rpc("classroom_command", { p_action: "submit", p_data: { assignment: pending.assignment.id, request_id: pending.request_id, content: pending.content, activity: pending.activity } });
      if (error) throw error;
      sessionStorage.removeItem(key);
      sessionStorage.removeItem(pendingAssignmentStorageKey);
      setPendingAssignmentResult(null);
      setAssignedPractice(null);
      setNotice("Assigned activity submitted to your classroom.");
      return { ok: true, message: "" };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "network error";
      setNotice(`Assignment complete, but Classroom could not save it: ${message}`);
      return { ok: false, message };
    } finally { assignmentSubmitInFlightRef.current = false; }
  }

  async function submitAiAssignment(transcript: DebateTurn[]) {
    const assignment = assignedPractice;
    if (!assignment || assignment.kind !== "ai_debate") return;
    if (!auth) { setAiAssignmentStatus("Sign in to save this assigned debate."); return; }
    setAiAssignmentStatus("Saving your result to Classroom…");
    const activity = { topic: debateTopic.trim(), mode: debatePracticeMode, turns: debateMaxTurns, transcript: transcript.map(turn => ({ speaker: turn.speaker, text: turn.text, audioPath: turn.audioPath||null })) };
    const content = transcript.map(turn => `${turn.speaker === "user" ? "You" : "AI opponent"}: ${turn.text}`).join("\n").slice(0, 30000);
    const result = await submitAssignedResult(assignment, content, activity);
    setAiAssignmentStatus(result.ok ? "Assigned debate submitted to your classroom." : `Debate complete, but Classroom could not save it: ${result.message}`);
  }

  function cancelSpeechCapture() {
    captureGenerationRef.current++;
    if(speechTimeoutRef.current){window.clearTimeout(speechTimeoutRef.current);speechTimeoutRef.current=undefined;}
    const recorder=recorderRef.current;
    if(recorder?.state==="recording"){
      recorder.ondataavailable=null;recorder.onstop=null;
      try{recorder.stop();}catch{}
    }
    recorderRef.current=null;
    streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;
    setIsRecording(false);setLiveRecording(false);setSpeechBusy(false);setLiveSpeechBusy(false);
  }

  function discardSpeech() {
    cancelSpeechCapture();
    setSpeechBlob(null);if(speechUrl)URL.revokeObjectURL(speechUrl);setSpeechUrl("");setDebateDraft("");setSpeechNotice("Recording discarded.");
  }

  function stopSpeechRecording() {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  }

  async function startSpeechRecording() {
    setSpeechNotice("");
    if(isRecording||speechBusy)return;
    if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder){setSpeechNotice("This browser cannot record audio. Choose written practice instead.");return;}
    const generation=++captureGenerationRef.current;
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(generation!==captureGenerationRef.current||viewRef.current!=="ai-room"){stream.getTracks().forEach(track=>track.stop());return;}
      streamRef.current=stream;
      const mimeType=["audio/webm;codecs=opus","audio/mp4","audio/ogg;codecs=opus"].find(type=>MediaRecorder.isTypeSupported(type));
      if(!mimeType)throw new Error("No supported recording format is available in this browser.");
      const recorder=new MediaRecorder(stream,{mimeType});recorderRef.current=recorder;const chunks:BlobPart[]=[];let totalBytes=0;
      recorder.ondataavailable=event=>{if(event.data.size){chunks.push(event.data);totalBytes+=event.data.size;if(totalBytes>10*1024*1024)recorder.stop();}};
      recorder.onstop=()=>{
        if(speechTimeoutRef.current){window.clearTimeout(speechTimeoutRef.current);speechTimeoutRef.current=undefined;}
        stream.getTracks().forEach(track=>track.stop());if(streamRef.current===stream)streamRef.current=null;
        if(generation!==captureGenerationRef.current)return;
        recorderRef.current=null;setIsRecording(false);
        const blob=new Blob(chunks,{type:mimeType.split(";")[0]});
        if(!blob.size||blob.size>10*1024*1024){setSpeechNotice("Recording must be smaller than 10 MB. Try a shorter turn.");return;}
        if(speechUrl)URL.revokeObjectURL(speechUrl);setSpeechBlob(blob);setSpeechUrl(URL.createObjectURL(blob));setSpeechBusy(true);setSpeechNotice("Transcribing your recording…");
        const reader=new FileReader();
        reader.onload=async()=>{
          if(generation!==captureGenerationRef.current)return;
          try{
            const encoded=String(reader.result).split(",")[1];
            const data=await invokeVeritasFunction("ai-debate",{action:"transcribe",audio:encoded,mimeType:blob.type});
            if(generation!==captureGenerationRef.current)return;
            if(data?.ok!==true||typeof data.text!=="string"||!data.text.trim())throw new Error("No speech transcript was returned.");
            setDebateDraft(data.text.slice(0,8000));setSpeechNotice("Recording ready. Review and edit the transcript before sending.");
          }catch(cause){if(generation===captureGenerationRef.current)setSpeechNotice(`${cause instanceof Error?cause.message:"Transcription failed."} Type the transcript of your saved recording to continue.`);}
          finally{if(generation===captureGenerationRef.current)setSpeechBusy(false);}
        };
        reader.onerror=()=>{if(generation===captureGenerationRef.current){setSpeechBusy(false);setSpeechNotice("Could not read the recording. Try again.");}};
        reader.readAsDataURL(blob);
      };
      recorder.start(1000);setIsRecording(true);setDebateDraft("");setSpeechBlob(null);if(speechUrl)URL.revokeObjectURL(speechUrl);setSpeechUrl("");setSpeechNotice(`Recording for up to ${speechSeconds} seconds.`);
      speechTimeoutRef.current=window.setTimeout(()=>{if(recorder.state==="recording")recorder.stop();},speechSeconds*1000);
    }catch(cause){streamRef.current?.getTracks().forEach(track=>track.stop());streamRef.current=null;if(generation===captureGenerationRef.current)setSpeechNotice(cause instanceof Error?cause.message:"Microphone access was unavailable.");}
  }

  async function submitAiArgument(event: React.FormEvent<HTMLFormElement>|null, outOfTime=false) {
    event?.preventDefault();
    if(outOfTime&&(isRecording||speechBusy))cancelSpeechCapture();
    const text=outOfTime?"⌛ (out of time — no argument made this turn)":debateDraft.trim();
    if(!auth||!sessionEmail) {setDebateError("Sign in to debate the AI.");return;}
    if(!outOfTime&&text.length<12) {setDebateError("Write at least one complete sentence (12 characters). ");return;}
    if(!outOfTime&&debatePracticeMode==="speech"&&!speechBlob){setDebateError("Record and review your speech before sending this turn.");return;}
    if(debateBusy||aiTurnSubmitRef.current||debateTurns.filter(t=>t.speaker==="user").length>=debateMaxTurns)return;
    aiTurnSubmitRef.current=true;
    const turnStartedAt=debateTurnStartedAt;
    setDebateBusy(true);setDebateError("");
    setDebateTurnStartedAt(null);
    const userTurns=debateTurns.filter(t=>t.speaker==="user").length+1;
    let audioPath:string|null=null;
    if (!outOfTime && speechBlob && uploadedSpeech.current?.blob === speechBlob) {
      audioPath = uploadedSpeech.current.path;
    } else if(!outOfTime&&debatePracticeMode==="speech") {
      try {
        const {data:userData,error:userError}=await auth.auth.getUser();if(userError||!userData.user)throw userError||new Error("Sign in to save your recording.");
        const ext=speechBlob!.type==="audio/mp4"?"m4a":speechBlob!.type==="audio/ogg"?"ogg":"webm";audioPath=`${userData.user.id}/${crypto.randomUUID()}.${ext}`;
        const {error:uploadError}=await auth.storage.from("debate-recordings").upload(audioPath,speechBlob!,{contentType:speechBlob!.type,upsert:false});if(uploadError)throw uploadError;
        const {error:registerError}=await auth.rpc("register_debate_recording",{p_path:audioPath,p_debate_id:null,p_assignment_id:assignedPractice?.kind==="ai_debate"?assignedPractice.id:null});if(registerError){await auth.storage.from("debate-recordings").remove([audioPath]);throw registerError;}
        uploadedSpeech.current = { blob: speechBlob!, path: audioPath };
        const {data:signed}=await auth.storage.from("debate-recordings").createSignedUrl(audioPath,300);if(signed?.signedUrl)setPlaybackUrls(existing=>({...existing,[audioPath!]:signed.signedUrl}));
      } catch(cause){setDebateBusy(false);setDebateError(cause instanceof Error?cause.message:"Couldn't save the recording. Try again.");setAiTurnNow(Date.now());setDebateTurnStartedAt(Date.now());aiTurnSubmitRef.current=false;return;}
    }
    const spent=turnStartedAt===null?0:Math.max(0,(Date.now()-turnStartedAt)/1000);const nextTranscript:DebateTurn[]=[...debateTurns,{speaker:"user",text,audioPath,spent}];
    setDebateTurns(nextTranscript);setDebateDraft("");

    let aiText="";
    const responseStartedAt=Date.now();
    try {
      const data=await invokeVeritasFunction("ai-debate",{action:"opponent",topic:debateTopic.trim(),transcript:nextTranscript,aiStance:debateStance==="for"?"against":"for",difficulty:debateBot});
      
      if(data?.ok!==true||typeof data.text!=="string"||!data.text.trim()||data.text.length>6000)throw new Error("The AI response was incomplete. Please try again.");
      aiText=data.text.trim();
      uploadedSpeech.current = null;
      setSpeechBlob(null);
      if (speechUrl) URL.revokeObjectURL(speechUrl);
      setSpeechUrl("");
      setSpeechNotice("");
      const withAi=[...nextTranscript,{speaker:"ai" as const,text:aiText,spent:Math.max(0,(Date.now()-responseStartedAt)/1000)}];setDebateTurns(withAi);
      if(userTurns>=debateMaxTurns) await scoreAiDebate(withAi);
      else {setAiTurnNow(Date.now());setDebateTurnStartedAt(Date.now());}
    } catch(cause) {
      // Restore the draft and retain the reviewed audio for retry.
      setDebateTurns(debateTurns);setDebateDraft(text);setDebateError(cause instanceof Error?cause.message:"The AI opponent could not respond. Please try again.");setAiTurnNow(Date.now());setDebateTurnStartedAt(Date.now());
    } finally {setDebateBusy(false);aiTurnSubmitRef.current=false;}
  }

  async function scoreAiDebate(turns:DebateTurn[]) {
    if (refereeInFlight.current) return;
    refereeInFlight.current = true; setAssessmentBusy(true);
    const generation = ++assessmentGeneration.current;
    let completedVerdict: DebateVerdict | null = null;
    try {
      const data=await invokeVeritasFunction("ai-debate",{action:"referee",topic:debateTopic.trim(),transcript:turns});
      if (generation !== assessmentGeneration.current) return;
      const v=data?.verdict;
      if(data?.ok!==true||!v||!Number.isFinite(v.debaterScore)||!Number.isFinite(v.aiScore)||typeof v.summary!=="string"||!Array.isArray(v.turnFeedback))throw new Error("Referee response malformed.");
      const rawDevil=v.devilsAdvocate;const devilsAdvocate=rawDevil&&typeof rawDevil.missedPoint==="string"&&rawDevil.missedPoint.trim()?{missedPoint:rawDevil.missedPoint.trim(),challenge:typeof rawDevil.challenge==="string"?rawDevil.challenge.trim():"Argue the strongest version of this point."}:null;
      const coaching = readDebateCoaching(v.coaching, turns.filter(turn => turn.speaker === "user").length);
      completedVerdict = { ...v, devilsAdvocate, coaching } as DebateVerdict;
      setDebateVerdict(completedVerdict);
      setDebateEstimated(false);
    } catch {
      if (generation !== assessmentGeneration.current) return;
      const userTurns=turns.filter(t=>t.speaker==="user");
      const connectives=["because","therefore","however","for example"];

      const turnFeedback=userTurns.map((turn,index)=>{const words=turn.text.trim().split(/\s+/).filter(Boolean).length;const has=connectives.some(c=>turn.text.toLowerCase().includes(c));return{turn:index+1,logic:has?"Used clear reasoning connectors.":"Make the reasoning link more explicit.",evidence:words>25?"Argument had useful detail.":"Add a concrete example or evidence.",responsiveness:"Estimated locally; not independently reviewed."};});

      setDebateVerdict({debaterScore:0,aiScore:0,winner:"unavailable",summary:"The AI referee was unavailable. No score or winner has been assigned. Review your transcript or retry the assessment.",turnFeedback,estimated:true});setDebateEstimated(true);
    } finally {
      if (generation !== assessmentGeneration.current) return;
      refereeInFlight.current = false; setAssessmentBusy(false);
      try {
        const key = `veritas:debate-reports:${progressOwner || "guest"}`;
        const previous = JSON.parse(localStorage.getItem(key) || "[]");
        localStorage.setItem(key, JSON.stringify([{ topic: debateTopic, transcript: turns, verdict: completedVerdict, completedAt: new Date().toISOString() }, ...(Array.isArray(previous) ? previous : [])].slice(0, 30)));
      } catch { /* The current transcript remains available. */ }
      if (assignedPractice?.kind === "ai_debate") {
        setAiAssignmentTranscript(turns);
        void submitAiAssignment(turns);
      }
      if (["ai-room", "ai-result"].includes(viewRef.current)) setView("ai-result");
    }
  }

  async function submitDevilsAdvocateDrill(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const point=debateVerdict?.devilsAdvocate?.missedPoint;
    const rebuttal=devilDraft.trim();
    if(!point||!rebuttal||devilBusy||devilResult)return;
    if(!auth||!sessionEmail){setDevilError("Sign in to submit this practice response.");return;}
    setDevilBusy(true);setDevilError("");
    try {
      const data=await invokeVeritasFunction("ai-debate",{action:"drill",topic:debateTopic.trim(),missedPoint:point,rebuttal});
      if(data?.ok!==true||!Number.isFinite(data.score)||data.score<0||data.score>100||typeof data.feedback!=="string"||!data.feedback.trim())throw new Error("The drill feedback was incomplete. Please try again.");
      setDevilResult({score:Math.round(data.score),feedback:data.feedback.trim()});
    } catch(cause) { setDevilError(cause instanceof Error?cause.message:"Could not score the Devil’s Advocate drill."); }
    finally { setDevilBusy(false); }
  }

    const appViewModel = { debatePlan: debatePlan?.motion === debateTopic.trim() ? debatePlan : null, assessmentBusy, ArrowRight, Check, Flame, LoaderCircle, ProfileScreen, Study, Swords, activeMode, advanceQuestion, aiAssignmentStatus, aiAssignmentTranscript, aiTopicSamples, assignedPractice, awardStudyXp, beginAiDebate, busy, confirmPassword, createPrivateRoom, currentAnswer, debateBot, debateBusy, debateDraft, debateError, debateEstimated, debateMaxTurns, debatePracticeMode, debateStance, debateTopic, debateTurnSeconds, debateTurns, debateVerdict, devilBusy, devilDraft, devilError, devilResult, difficulty, discardPracticeRun, discardSpeech, eloRows, email, error, formatLiveClock, guestMode, isRecording, isSupabaseConfigured, joinPrivateRoom, joinPublicQueue, leaderError, leaderLoading, leaderTab, leaveQueue, liveAssignmentStatus, liveDraft, liveEloSummary, liveOpponentElo, liveOpponentName, livePracticeMode, liveRatingSent, liveRecording, liveRoom, liveRoomLoading, liveSecondsLeft, liveSending, liveSpeechBusy, liveSpeechMessage, liveSpeechUrl, liveTopic, liveTopics, liveTranscript, liveTurns, liveUid, matchError, matchSeconds, message, mode, nameDraft, nameEditing, notice, openLeaderboard, openLiveLobby, password, pausePracticeRun, pendingAssignmentResult, playbackUrls, practiceModeInfo, practiceModes, practiceQuestionBanks, privateBusy, privateCode, privateNotice, privateRoom, profile, profileBusy, profileMessage, progress, questionIndex, questions, rateLiveDebate, saveDisplayName, score, sessionAccountId, sessionEmail, setSyncAttempt, setProgressState, setActiveMode, setAiAssignmentStatus, setAssignedPractice, setConfirmPassword, setDebateBot, setDebateDraft, setDebateError, setDebateMaxTurns, setDebatePracticeMode, setDebateStance, setDebateTopic, setDebateTurnSeconds, setDevilDraft, setDifficulty, setEmail, setError, setGuestMode, setLiveAssignmentStatus, setLiveDraft, setLivePracticeMode, setLiveTopic, setLiveTranscript, setLiveTurns, setMatchError, setMessage, setMode, setNameDraft, setNameEditing, setNotice, setPassword, setPrivateCode, setPrivateNotice, setPrivateRoom, setProfileMessage, setShowAiTopicBrowser, setSpeechSeconds, setView, showAiTopicBrowser, signOut, speechBlob, speechBusy, speechNotice, speechSeconds, speechUrl, speedLimit, setSpeedLimit, scoreAiDebate, speedSecondsLeft, startDailyChallenge, startLiveRecording, startPracticeRun, startSpeechRecording, stopSpeechRecording, streakNow, submit, submitAiArgument, submitAiAssignment, submitAnswer, submitAssignedResult, submitDevilsAdvocateDrill, submitLiveAssignment, submitLiveTurn, submittedLiveAssignmentRef, summary, uploadAvatar };
if ((sessionEmail && mode !== "reset") || guestMode) {
    const tomorrow = nextUtcReset(now);
    const remaining = Math.max(0, Math.floor((tomorrow-now)/1000));
    const countdown = `${String(Math.floor(remaining/3600)).padStart(2,"0")}:${String(Math.floor((remaining%3600)/60)).padStart(2,"0")}:${String(remaining%60).padStart(2,"0")}`;
    const todayDate = new Date(now).toISOString().slice(0,10);
    const todayIndex = Math.floor(Date.parse(`${todayDate}T00:00:00Z`) / 86400000);
    const dailyModeInfo = practiceModes[((todayIndex % practiceModes.length) + practiceModes.length) % practiceModes.length];
    const activeModeInfo = practiceModeInfo(activeMode);
    const liveRefereeEstimate = null;
    const liveStats=liveRoom?liveTurnStats(liveRoom):null;
    const activeLiveUid=liveRoom?.status==="active"?liveRoom.player_order[liveRoom.turn_index%2]:null;
    const liveTurnTotal=liveRoom?liveRoom.max_turns_per_player*2:0;
    const liveRefereeWinnerUid=liveRoom?.ai_verdict?.winnerUid;
    const liveRefereeWinnerLabel=liveRoom?.ai_verdict?(liveRefereeWinnerUid?(liveRefereeWinnerUid===liveUid?"Your side wins":`${liveOpponentName} wins`):"The debate is tied"):"Assessment pending — no winner assigned";
    const selectedQuestionCount = (practiceQuestionBanks[activeMode] || []).filter(question => difficulty === "all" || question.difficulty === difficulty).length;
    const dailyDone = progress.dailyCompletedDate === todayDate;
    const aiTurnLimit = debatePracticeMode === "speech" ? speechSeconds + 180 : debateTurnSeconds;
    const aiTurnRemaining = debateTurnStartedAt !== null && aiTurnLimit > 0 ? Math.max(0, Math.ceil(aiTurnLimit - (aiTurnNow - debateTurnStartedAt) / 1000)) : null;
    const totalDecisions=profile.wins+profile.losses+profile.ties;
    const winRate=totalDecisions?Math.round(profile.wins/totalDecisions*100):null;
    const skillRows=[{key:"logic",label:"Evidence & logic"},{key:"strategy",label:"Rebuttals"},{key:"rhetoric",label:"Steelman"},{key:"speed",label:"Quick thinking"},{key:"analysis",label:"Analysis"}];
    const homeSkillRows=skillRows.slice(0,4);
    const recommendedSkill=homeSkillRows.reduce((lowest,skill)=>Number(progress.skills?.[skill.key]||0)<Number(progress.skills?.[lowest.key]||0)?skill:lowest,homeSkillRows[0]);
    const recommendedMode:PracticeMode=({logic:"fallacy",strategy:"rebuttal",rhetoric:"steelman",speed:"speed"} as const)[recommendedSkill.key as "logic"|"strategy"|"rhetoric"|"speed"];
    const modeEntries=Object.entries(progress.modeStats||{}) as [string,{plays?:number;bestPct?:number;lastPlayedAt?:string}][];
    const favoritePractice=modeEntries.filter(([key,stats])=>practiceModes.some(mode=>mode.id===key)&&(Number(stats?.plays)||0)>=3).sort((a,b)=>(Number(b[1]?.plays)||0)-(Number(a[1]?.plays)||0)||String(b[1]?.lastPlayedAt||"").localeCompare(String(a[1]?.lastPlayedAt||"")))[0];
    const favoriteMode=favoritePractice?practiceModeInfo(favoritePractice[0] as PracticeMode):null;
    const recentMode = modeEntries.filter(([id, stats]) => practiceModes.some(item => item.id === id) && stats.lastPlayedAt)
      .sort(([, a], [, b]) => String(b.lastPlayedAt).localeCompare(String(a.lastPlayedAt)))[0]?.[0] as PracticeMode | undefined;
    const favoritePlays=favoritePractice?Math.max(0,Math.floor(Number(favoritePractice[1]?.plays)||0)):0;
    const favoriteBest=favoritePractice?Math.max(0,Math.min(100,Math.round(Number(favoritePractice[1]?.bestPct)||0))):0;
    const badges=[{id:"first_win",name:"First practice run",icon:"✓",on:progress.totalRuns>=1},{id:"streak3",name:"3-Day Streak",icon:"♨",on:progress.streak>=3},{id:"streak7",name:"7-Day Streak",icon:"✦",on:progress.streak>=7},{id:"fallacy_master",name:"Fallacy Master",icon:"⚡",on:(progress.modeStats.fallacy?.bestPct||0)>=90},{id:"steelman_pro",name:"Steelman Pro",icon:"⬟",on:(progress.modeStats.steelman?.bestPct||0)>=80},{id:"speed_demon",name:"Quick Thinker",icon:"◷",on:(progress.modeStats.speed?.bestPct||0)>=90},{id:"xp1000",name:"1K Club",icon:"✧",on:progress.totalXp>=1000},{id:"all_modes",name:"Well Rounded",icon:"◎",on:Object.keys(progress.modeStats||{}).length>=4}];
    const profileSkills=skillRows.map(skill=>{
      const records = Object.values(progress.assessments||{}).filter((record:any)=>record?.skill===skill.key) as {at:number}[];
      return {...skill,value:Math.max(0,Math.min(100,Number(progress.skills?.[skill.key])||0)),assessed:records.length>0,samples:records.length,lastAssessed:records.length?Math.max(...records.map(record=>record.at)):null};
    });
    let rngSeed=42;const rng=()=>{rngSeed|=0;rngSeed=(rngSeed+0x6D2B79F5)|0;let t=Math.imul(rngSeed^(rngSeed>>>15),1|rngSeed);t=(t+Math.imul(t^(t>>>7),61|t))^t;return((t^(t>>>14))>>>0)/4294967296;};
    const xpRows:LeaderRow[]=["Aria K.","Devon P.","Lena W.","Mika T.","Sam R.","Priya N.","Jonas L.","Talia M.","Eli B.","Nadia F."].map(name=>({name,score:Math.floor(400+rng()*3200)}));
    xpRows.push({name:profile.displayName||sessionEmail?.split("@")[0]||"You",score:progress.totalXp,self:true});xpRows.sort((a,b)=>b.score-a.score);
    const rank = progress.totalXp >= 4500 ? "Grandmaster of Rhetoric" : progress.totalXp >= 2800 ? "Master Orator" : progress.totalXp >= 1600 ? "Logic Tactician" : progress.totalXp >= 800 ? "Skilled Rhetorician" : progress.totalXp >= 300 ? "Rising Arguer" : "Novice Debater";
    const nextRank = [300, 800, 1600, 2800, 4500].find(xp => progress.totalXp < xp);
    const pct = nextRank ? Math.min(100, Math.round((progress.totalXp / nextRank) * 100)) : 100;
    function navigate(destination: Destination) {
      if (view === "ai-room" && debateBusy) {
        setDebateError("Wait for the current response before leaving the debate.");
        return;
      }
      setNotice("");
      if (view === "game" || destination === "setup") setAssignedPractice(null);
      if (destination === "leaderboard") {
        void openLeaderboard("xp");
      } else if (destination === "live-lobby") {
        void openLiveLobby();
      } else if (destination === "ai-setup") {
        setDebateError("");
        void loadLiveTopics();
        setView(destination);
      } else {
        setView(destination);
      }
    }
        const screenViewModel = { ...appViewModel, activeLiveUid, activeModeInfo, aiTurnRemaining, badges, countdown, dailyDone, dailyModeInfo, favoriteBest, favoriteMode, favoritePlays, homeSkillRows, liveRefereeEstimate, liveRefereeWinnerLabel, liveStats, liveTurnTotal, navigate, nextRank, recentMode, pct, profileSkills, rank, recommendedMode, selectedQuestionCount, winRate, xpRows };
    const screenContent = (() => { switch (view) {
      case "home": return <HomeScreen key={sessionAccountId || "guest"} state={{
        progress, recommendedMode, recentMode, favoriteMode, favoriteBest, favoritePlays, rank, nextRank, pct, homeSkillRows,
        guestMode, isSupabaseConfigured, pendingAssignmentResult, submitAssignedResult, notice, resumeSession,
        dismissNotice: () => setNotice(""),
        discardResume: discardPracticeRun,
        resumePractice: resumePracticeRun,
        startBaseline: (id) => {
          setAssignedPractice(null);
          startPracticeRun(id, "all", false, 3, true);
        },
        openPractice: (id) => { setAssignedPractice(null); setActiveMode(id); navigate("setup"); },
        openAccount: () => { setMode("signup"); setGuestMode(false); setError(""); setMessage(""); },
        navigate,
        dailyDone, dailyModeInfo, countdown, sessionEmail, sessionAccountId, displayName: profile.displayName,
      }} />;
      case "arcade": return <><h1 className="workspace-page-title">Arcade</h1><p className="workspace-lead">Daily practice goals and achievements earned from your activity.</p><ArcadeDashboard progress={progress} /></>;
      case "study": return <StudyScreen state={screenViewModel} />;
      case "classroom": return <ClassroomScreen state={screenViewModel} />;
      case "evidence": return null;
      case "ai-evidence": return evidencePractice && evidencePractice.accountId === sessionAccountId
        ? <EvidencePractice key={evidencePractice.card.id} card={evidencePractice.card} round={evidencePractice.round}
          onChange={change => setEvidencePractice(previous => previous?.card.id === evidencePractice.card.id
            ? { ...previous, round: { ...previous.round, ...change } } : previous)}
          onBack={() => setView("evidence")} />
        : <AiDebateSetupScreen state={screenViewModel} />;
      case "setup": return <PracticeSetupScreen state={screenViewModel} />;
      case "daily": return <DailyChallengeScreen state={screenViewModel} />;
      case "profile": return <ProfileViewScreen state={screenViewModel} />;
      case "leaderboard": return <LeaderboardScreen state={screenViewModel} />;
      case "live-lobby": return <LiveLobbyScreen state={screenViewModel} />;
      case "live-search": return <LiveSearchScreen state={screenViewModel} />;
      case "live-room": return <LiveDebateRoomScreen state={screenViewModel} />;
      case "ai-setup": return <AiDebateSetupScreen state={screenViewModel} />;
      case "ai-room": return <AiDebateRoomScreen state={screenViewModel} />;
      case "ai-result": return <AiDebateResultScreen state={screenViewModel} />;
      case "game": return <SoloDrillScreen state={screenViewModel} />;
      case "summary": return <PracticeSummaryScreen state={screenViewModel} />;
      default: return <PracticeSummaryScreen state={screenViewModel} />;
    } })();
    return (
      <AppShell view={view} guest={guestMode} practiceRuns={progress.totalRuns} account={profile.displayName || sessionEmail || "Profile"}
        navigate={navigate} signOut={guestMode ? () => setGuestMode(false) : () => void signOut()}>
        {view !== "home" && notice && <p className="workspace-note" role="status">{notice}</p>}
        <div hidden={view !== "evidence"}>
          <EvidenceLabScreen state={{ ...screenViewModel, sessionAccountId }}
            onPrepareDebate={(motion, outline) => { setAssignedPractice(null); setDebateTopic(motion); setDebatePlan({ motion, outline }); setView("ai-setup"); }}
            onResumePractice={evidencePractice?.accountId === sessionAccountId ? () => setView("ai-evidence") : undefined}
            onPractice={card => {
              if (!sessionAccountId) return;
              setEvidencePractice(previous => previous?.accountId === sessionAccountId
                && previous.card.id === card.id && previous.card.quote === card.quote
                ? { ...previous, card }
                : { accountId: sessionAccountId, card, round: { side: card.side, original: "", revision: "", challenge: null, feedback: null } });
              setView("ai-evidence");
            }} />
        </div>
        {screenContent}
      </AppShell>
    );
  }

  return <AuthScreen state={{
    busy, confirmPassword, email, error, isSupabaseConfigured, message, mode, password, setConfirmPassword,
    setEmail, setError, setGuestMode, setMessage, setMode, setPassword, submit,
  }} />;
}
