import { ArrowRight, BookOpen, Clock3, Flame, GraduationCap, MessageSquare, Search, Swords, Zap } from "lucide-react";
import { practiceModeInfo, practiceModes, type PracticeMode, type PracticeModeInfo } from "../practice-questions";
import type { Destination } from "../../components/AppShell";
import type { Assignment } from "../Classroom";

const modeDetails = {
  fallacy: { icon: Search, skill: "Evidence and logic", duration: "About 4 minutes" },
  rebuttal: { icon: MessageSquare, skill: "Rebuttals", duration: "About 5 minutes" },
  speed: { icon: Zap, skill: "Quick thinking", duration: "About 2 minutes" },
  steelman: { icon: Swords, skill: "Steelmanning", duration: "About 5 minutes" },
};

type HomeState = {
  progress: {
    totalXp: number;
    totalRuns: number;
    activity: Record<string, number>;
    skills: Record<string, number>;
    assessments: Record<string, { skill: string }>;
  };
  recommendedMode: PracticeMode;
  recentMode?: PracticeMode;
  favoriteMode: PracticeModeInfo | null;
  favoriteBest: number;
  favoritePlays: number;
  homeSkillRows: { key: string; label: string }[];
  guestMode: boolean;
  isSupabaseConfigured: boolean;
  pendingAssignmentResult: { assignment: Assignment; content: string; activity: Record<string, unknown> } | null;
  submitAssignedResult: (assignment: Assignment, content: string, activity: Record<string, unknown>) => Promise<unknown>;
  notice: string;
  dismissNotice: () => void;
  openPractice: (id: PracticeMode) => void;
  openAccount: () => void;
  navigate: (destination: Destination) => void;
};

export default function HomeScreen({ state }: { state: HomeState }) {
  const {
    progress, recommendedMode, recentMode, favoriteMode, favoriteBest, favoritePlays, homeSkillRows,
    guestMode, isSupabaseConfigured, pendingAssignmentResult, submitAssignedResult, notice,
    dismissNotice, openPractice, openAccount, navigate,
  } = state;
  const assessed = new Set(Object.values(progress.assessments).map(record => record.skill));
  const recommendation = practiceModeInfo(assessed.size ? recommendedMode : "fallacy");
  const details = modeDetails[recommendation.id];
  const unassessed = !assessed.has(recommendation.skill);
  const reason = assessed.size === 0
    ? "Start by spotting the gap between a claim and the reasoning behind it. Your answers will give you a baseline for future practice."
    : unassessed
      ? `You haven’t completed an assessed drill for ${details.skill.toLowerCase()} yet. This session gives you a baseline.`
      : `Your saved practice puts ${details.skill.toLowerCase()} among the skills with the most room to improve.`;
  const recentDays = Object.entries(progress.activity).sort(([a], [b]) => b.localeCompare(a)).slice(0, 3);

  return (
    <div className="home-workspace">
      <header className="home-heading">
        <h1 className="workspace-page-title">Practice workspace</h1>
        <p className="workspace-lead">Build your skills one argument at a time.</p>
      </header>

      <section className="home-recommendation" aria-labelledby="next-practice-title">
        <div>
          <p className="workspace-caption">Recommended practice</p>
          <h2 id="next-practice-title">{recommendation.name}</h2>
          <p>{reason}</p>
          <div className="home-recommendation-meta">
            <span><Clock3 size={16} aria-hidden="true" />{details.duration}</span>
            <span>{details.skill}</span>
          </div>
          <button type="button" className="workspace-primary" onClick={() => openPractice(recommendation.id)}>
            Set up {recommendation.name}<ArrowRight size={17} aria-hidden="true" />
          </button>
        </div>
        <aside className="home-practice-preview">
          <details.icon size={24} strokeWidth={1.5} aria-hidden="true" />
          <h3>What you’ll practise</h3>
          <p>{recommendation.description}</p>
          <span>Up to 8 questions with feedback</span>
        </aside>
      </section>

      <div className="home-review">
        <section aria-labelledby="home-progress-title">
          <h2 id="home-progress-title">Your practice progress</h2>
          {progress.totalRuns === 0 && assessed.size === 0 && progress.totalXp === 0 ? (
            <div className="workspace-empty">
              <strong>No assessed practice yet</strong>
              <p>Finish your first drill to see an estimate based on your answers. Fresh questions and later reviews update each skill.</p>
            </div>
          ) : (
            <>
              <p className="workspace-meta">All time on this device · {progress.totalRuns} completed {progress.totalRuns === 1 ? "run" : "runs"} · {progress.totalXp.toLocaleString()} earned XP</p>
              <p className="workspace-meta">Mastery estimates use fresh drill answers and later reviews across difficulty levels.</p>
              <ul className="home-skill-list">
                {homeSkillRows.map(({ key, label }) => (
                  <li key={key}><span>{label}</span><strong>{assessed.has(key) ? `${Math.round(progress.skills[key] || 0)}% estimated` : "Not assessed"}</strong></li>
                ))}
              </ul>
            </>
          )}
        </section>
        <section aria-labelledby="home-activity-title">
          <h2 id="home-activity-title">Recent practice</h2>
          {recentDays.length ? (
            <ul className="home-skill-list">{recentDays.map(([day, count]) => (
              <li key={day}><time dateTime={day}>{new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</time>
                <strong>{count} completed {count === 1 ? "run" : "runs"}</strong></li>
            ))}</ul>
          ) : <div className="workspace-empty"><strong>No recent sessions</strong><p>Completed practice sessions will appear here.</p></div>}
          {recentMode && <button className="workspace-text-action" onClick={() => openPractice(recentMode)}>Practise {practiceModeInfo(recentMode).name} again <ArrowRight size={15} /></button>}
          {favoriteMode && favoriteMode.id !== recentMode && (
            <button className="workspace-text-action" onClick={() => openPractice(favoriteMode.id)}>
              {favoriteMode.name} · {favoritePlays} runs, {favoriteBest}% best accuracy <ArrowRight size={15} />
            </button>
          )}
        </section>
      </div>

      <section className="home-formats" aria-labelledby="home-formats-title">
        <h2 id="home-formats-title">Practice formats</h2>
        <ul>{practiceModes.map(item => {
          const Icon = modeDetails[item.id].icon;
          return <li key={item.id}><button className="home-format" onClick={() => openPractice(item.id)}>
            <Icon size={19} aria-hidden="true" /><span><strong>{item.name}</strong><small>{item.description}</small></span><ArrowRight size={16} aria-hidden="true" />
          </button></li>;
        })}</ul>
      </section>

      <section className="home-secondary" aria-labelledby="home-secondary-title">
        <h2 id="home-secondary-title">More ways to practise</h2>
        <div>
          <button className="workspace-text-action" onClick={() => navigate("daily")}><Flame size={17} />Daily Challenge</button>
          <button className="workspace-text-action" onClick={() => navigate("study")}><BookOpen size={17} />Study paths</button>
          <a className="workspace-text-action" href="/demo/index.html"><GraduationCap size={17} />Preview the club workflow</a>
        </div>
      </section>

      {guestMode && <aside className="workspace-note">
        <strong>Guest practice</strong>
        <p>Your progress is saved on this device. {isSupabaseConfigured ? "An account is required for AI debates, Evidence Lab, live matches, and Classroom." : "Account and live services are unavailable in this installation."}</p>
        {isSupabaseConfigured && <button type="button" className="workspace-text-action" onClick={openAccount}>Create an account <ArrowRight size={15} /></button>}
      </aside>}
      {notice && <div className="workspace-note" role="status">{notice}<button className="workspace-text-action" onClick={dismissNotice}>Dismiss</button></div>}
      {pendingAssignmentResult && <div className="workspace-note" role="status">
        <p>Your completed assignment is saved in this tab and still needs delivery to Classroom.</p>
        <button className="workspace-text-action" onClick={() => void submitAssignedResult(pendingAssignmentResult.assignment, pendingAssignmentResult.content, pendingAssignmentResult.activity)}>Retry submission</button>
      </div>}
    </div>
  );
}
