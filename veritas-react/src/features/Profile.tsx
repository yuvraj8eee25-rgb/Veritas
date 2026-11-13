import type { ChangeEvent, FormEvent } from "react";
import { ArrowLeft, Camera, Check, LockKeyhole, Pencil, X } from "lucide-react";

type ProfileData = {
  displayName: string | null;
  elo: number | null;
  wins: number;
  losses: number;
  ties: number;
  avatarUrl: string | null;
};

type ProfileSkill = { key: string; label: string; value: number; assessed: boolean };
type ProfileBadge = { id: string; name: string; icon: string; on: boolean };

type ProfileScreenProps = {
  profile: ProfileData;
  profileMessage: string;
  nameEditing: boolean;
  nameDraft: string;
  profileBusy: boolean;
  guestMode: boolean;
  sessionEmail: string | null;
  totalXp: number;
  totalRuns: number;
  streak: number;
  activity: Record<string, number>;
  skills: ProfileSkill[];
  badges: ProfileBadge[];
  rank: string;
  nextRank?: number;
  rankProgress: number;
  winRate: number | null;
  onBack: () => void;
  onPractice: () => void;
  onFindMatch: () => void;
  onLeaderboard: () => void;
  onCreateAccount: () => void;
  onSignOut: () => void;
  onEditName: () => void;
  onSaveName: () => void;
  onCancelName: () => void;
  onNameChange: (value: string) => void;
  onUploadAvatar: (file?: File) => void;
};

function ProfileRadar({ skills }: { skills: ProfileSkill[] }) {
  const center = 160;
  const radius = 106;
  const pointAt = (value: number, index: number, scale = 1) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / skills.length;
    const distance = radius * (value / 100) * scale;
    return { x: center + Math.cos(angle) * distance, y: center + Math.sin(angle) * distance, angle };
  };
  const plot = skills.map((skill, index) => pointAt(skill.value, index));
  const points = plot.map(({ x, y }) => `${x},${y}`).join(" ");

  return (
    <svg className="profile-radar" viewBox="-40 0 400 320" role="img" aria-label={`Skill radar: ${skills.map(skill => `${skill.label} ${skill.assessed ? `${Math.round(skill.value)}%` : "unassessed"}`).join(", ")}`}>
      {[20, 40, 60, 80, 100].map(level => {
        const ring = skills.map((_, index) => pointAt(level, index));
        return <polygon key={level} points={ring.map(({ x, y }) => `${x},${y}`).join(" ")} className="radar-ring" />;
      })}
      {skills.map((skill, index) => {
        const end = pointAt(100, index);
        const label = pointAt(100, index, 1.28);
        const anchor = Math.cos(label.angle) > 0.35 ? "start" : Math.cos(label.angle) < -0.35 ? "end" : "middle";
        return <g key={skill.key}>
          <line x1={center} y1={center} x2={end.x} y2={end.y} className="radar-axis" />
          <text x={label.x} y={label.y} textAnchor={anchor} dominantBaseline="middle" className="radar-label">{skill.label}</text>
        </g>;
      })}
      <polygon points={points} className="radar-value-shape" />
      {plot.map((point, index) => <circle key={skills[index].key} cx={point.x} cy={point.y} r="3.2" className="radar-value-point" />)}
    </svg>
  );
}

export default function ProfileScreen(props: ProfileScreenProps) {
  const {
    profile, profileMessage, nameEditing, nameDraft, profileBusy, guestMode, sessionEmail,
    totalXp, totalRuns, streak, activity, skills, badges, rank, nextRank, rankProgress, winRate,
    onBack, onPractice, onFindMatch, onLeaderboard, onCreateAccount, onSignOut,
    onEditName, onSaveName, onCancelName, onNameChange, onUploadAvatar,
  } = props;
  const displayName = profile.displayName || sessionEmail?.split("@")[0] || "Debater";
  const totalDecisions = profile.wins + profile.losses + profile.ties;
  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    return { key, date, count: Math.max(0, Number(activity[key]) || 0) };
  });
  const previousWeek = days.slice(0, 7);
  const recentWeek = days.slice(7);
  const weekTotal = recentWeek.reduce((sum, day) => sum + day.count, 0);
  const weekPeak = Math.max(1, ...recentWeek.map(day => day.count));
  const previousTotal = previousWeek.reduce((sum, day) => sum + day.count, 0);
  const activeDays = recentWeek.filter(day => day.count > 0).length;
  const difference = Math.abs(weekTotal - previousTotal);
  const weekSummary = weekTotal
    ? `${weekTotal} sessions · ${activeDays} active days · ${weekTotal === previousTotal ? "same as" : `${difference} ${weekTotal > previousTotal ? "more" : "fewer"} than`} the previous seven days.`
    : "Your next completed session starts this week’s chart.";

  const hasAssessments = skills.some(skill => skill.assessed);
  const today = new Date();
  const heatmapLength = 25 * 7 + today.getDay() + 1;
  const heatmap = !Object.keys(activity).length ? [] : Array.from({ length: heatmapLength }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (heatmapLength - 1 - index));
    const key = date.toISOString().slice(0, 10);
    const count = Math.max(0, Number(activity[key]) || 0);
    const level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count <= 4 ? 3 : 4;
    return { key, count, level };
  });

  const handleAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    onUploadAvatar(event.target.files?.[0]);
    event.currentTarget.value = "";
  };
  const handleSaveName = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSaveName();
  };

  return (
    <section className="profile-page vanilla-profile">
      <header className="profile-subbar">
        <button type="button" className="profile-back" onClick={onBack}><ArrowLeft size={17} /> Back</button>
        <h1>Profile</h1>
        <span aria-hidden="true" />
      </header>

      <div className="profile-head">
        <div className="profile-avatar" aria-label={`${displayName} avatar`}>
          {profile.avatarUrl ? <img className="profile-avatar-img" src={profile.avatarUrl} alt={`${displayName}'s avatar`} /> : <span className="profile-avatar-monogram" aria-hidden="true">{displayName.trim().charAt(0).toUpperCase()}</span>}
          <button type="button" className="profile-avatar-edit-btn" disabled={profileBusy || guestMode} onClick={() => document.getElementById("react-avatar-input")?.click()} aria-label="Change avatar" aria-describedby="avatar-disclosure"><Camera size={13} /></button>
          <input id="react-avatar-input" hidden type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={handleAvatar} />
        </div>

        <div className="profile-identity">
          {nameEditing ? <form className="profile-name-edit-form" onSubmit={handleSaveName}>
            <label className="sr-label" htmlFor="profile-name-draft">Display name</label>
            <input id="profile-name-draft" className="profile-name-input" autoFocus maxLength={24} value={nameDraft} onChange={event => onNameChange(event.target.value)} placeholder="Your name" />
            <button type="submit" className="profile-name-save-btn" disabled={profileBusy} aria-label="Save display name"><Check size={14} /></button>
            <button type="button" className="profile-name-cancel-btn" onClick={onCancelName} aria-label="Cancel name edit"><X size={14} /></button>
          </form> : <div className="profile-name-row">
            <h2>{displayName}</h2>
            <button type="button" className="profile-name-edit-btn" disabled={guestMode} onClick={onEditName} aria-label="Edit display name"><Pencil size={13} /></button>
          </div>}
          <div className="profile-chips">
            <span className="profile-chip profile-chip-rank">{rank}</span>
            <span className="profile-chip">{totalXp.toLocaleString()} total XP</span>
            <span className="profile-chip profile-chip-quiet">Live rating: {profile.elo?.toLocaleString() ?? "—"}{totalDecisions ? ` · ${profile.wins}W ${profile.losses}L ${profile.ties}T` : ""}</span>
          </div>
        </div>

        <div className="profile-head-actions">
          <button type="button" className="profile-jump-btn" onClick={onFindMatch}>Find a match</button>
          <button type="button" className="profile-jump-btn ghost" onClick={onLeaderboard}>Leaderboard</button>
        </div>
      </div>

      {!guestMode && <p className="avatar-storage-note" id="avatar-disclosure">Choosing an image uploads it to your private account storage. PNG, JPG, WEBP, or GIF up to 5 MB.</p>}
      {profileMessage && <p className="profile-message" role="status">{profileMessage}</p>}
      {guestMode && <p className="profile-message">Sign in to edit your synced name or upload an avatar. Practice stats are available to guests.</p>}

      <div className="profile-stats" aria-label="Profile statistics">
        <div className="profile-stat"><span className="profile-stat-val">{profile.elo?.toLocaleString() ?? "—"}</span><span className="profile-stat-label">Live debate rating</span></div>
        <div className="profile-stat"><span className={`profile-stat-val ${winRate !== null && winRate >= 50 ? "positive" : winRate !== null ? "negative" : ""}`}>{winRate === null ? "—" : `${winRate}%`}</span><span className="profile-stat-label">Win rate</span></div>
        <div className="profile-stat"><span className="profile-stat-val">{profile.wins}–{profile.losses}–{profile.ties}</span><span className="profile-stat-label">W–L–T</span></div>
        <div className="profile-stat"><span className="profile-stat-val">{totalRuns.toLocaleString()}</span><span className="profile-stat-label">Sessions</span></div>
        <div className="profile-stat"><span className="profile-stat-val">{streak}</span><span className="profile-stat-label">Day streak</span></div>
      </div>

      <div className="profile-overview">
        <section className="profile-surface profile-week-card" aria-labelledby="profile-week-title">
          <h2 id="profile-week-title">Your last seven days</h2>
          <p className="profile-week-summary">{weekSummary}</p>
          {recentWeek.some(day => day.count > 0) && <div className="profile-week-chart" aria-label="Practice sessions in the last seven days">
            {recentWeek.map(day => <div className="profile-day" key={day.key} title={`${day.count} session${day.count === 1 ? "" : "s"}`}>
              <span>{day.count}</span><div className="profile-day-track"><div style={{ height: `${(day.count / weekPeak) * 100}%` }} /></div>
              <span>{day.date.toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</span>
            </div>)}
          </div>}
          <p className="profile-week-note">Counts completed sessions on this device. XP also includes bonus rewards, so the totals won’t match.</p>
        </section>
        <section className="profile-surface profile-rank-card">
          <h2 className="profile-surface-title">Rank progress</h2>
          <div className="profile-rank-now">
            <svg className="rank-seal" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".5" /><circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" strokeWidth="1" opacity=".3" /><path d="M32 16l4.6 10.3L48 27.6l-8 7.7 2 11.3-10-5.6-10 5.6 2-11.3-8-7.7 11.4-1.3z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /></svg>
            <div><strong>{rank}</strong><span>{nextRank ? `${(nextRank - totalXp).toLocaleString()} XP to next rank` : "Max rank reached"}</span></div>
          </div>
          <div className="profile-xp-bar" role="progressbar" aria-label="Progress to next rank" aria-valuenow={rankProgress} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${rankProgress}%` }} /></div>
          <p className="profile-week-note">XP unlocks ranks and titles. Your live debate rating changes separately through multiplayer results.</p>
        </section>
      </div>

      <section className="profile-surface profile-mastery" aria-labelledby="profile-mastery-title">
        <h2 className="profile-surface-title" id="profile-mastery-title">Practice mastery estimates</h2>
        <p className="profile-week-note">Estimates use distinct drill questions, difficulty, and delayed reviews.</p>
        {hasAssessments ? (
          <div className="profile-mastery-details">
            <ul className="skill-bars">
              {[...skills].sort((a, b) => a.value - b.value).map(skill => <li className="skill-bar-row" key={skill.key}>
                <span className="skill-bar-name">{skill.label}</span>
                <span className="skill-bar-track" aria-hidden="true"><span className="skill-bar-fill" style={{ width: `${Math.max(0, Math.min(100, skill.value))}%` }} /></span>
                <span className="skill-bar-val">{skill.assessed ? `${Math.round(skill.value)}%` : "Unassessed"}</span>
              </li>)}
            </ul>
            <ProfileRadar skills={skills} />
          </div>
        ) : (
          <div className="profile-mastery-empty">
            <p>Complete a drill to see your first estimate.</p>
            <button type="button" className="workspace-secondary" onClick={onPractice}>Choose a drill</button>
          </div>
        )}
      </section>

      <section className="profile-surface profile-badge-card">
        <h2 className="profile-surface-title">Achievements <em>{badges.filter(badge => badge.on).length} / {badges.length}</em></h2>
        <ul className="profile-achievements">{badges.map(badge => <li key={badge.id}>
          {badge.on ? <Check size={16} aria-hidden="true" /> : <LockKeyhole size={16} aria-hidden="true" />}
          <span>{badge.name}</span><small>{badge.on ? "Earned" : "Locked"}</small>
        </li>)}</ul>
      </section>

      <section className="profile-surface heatmap-card" aria-labelledby="profile-heatmap-title">
        <h2 className="profile-surface-title" id="profile-heatmap-title">Last 6 months</h2>
        {heatmap.some(day => day.count > 0) ? <><div className="heatmap-grid" aria-label="Practice activity over the last six months">{heatmap.map(day => <span key={day.key} className={`heat-cell heat-${day.level}`} title={`${day.key}: ${day.count} run${day.count === 1 ? "" : "s"}`} />)}</div>
        <div className="heatmap-legend"><span>Less</span>{[0, 1, 2, 3, 4].map(level => <span key={level} className={`heat-swatch heat-${level}`} />)}<span>More</span></div></> : <p className="workspace-meta">Your completed practice will appear here.</p>}
      </section>

      <div className="profile-actions">
        {guestMode ? <button type="button" className="profile-jump-btn ghost" onClick={onCreateAccount}>Create account</button> : <button type="button" className="profile-jump-btn ghost" onClick={onSignOut}>Sign out</button>}
      </div>
      
    </section>
  );
}
