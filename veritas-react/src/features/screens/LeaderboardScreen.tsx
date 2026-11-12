import { RefreshCw } from "lucide-react";
import type { LeaderRow } from "../../App";

type Tab = "xp" | "elo";
type LeaderboardState = {
  eloRows: LeaderRow[];
  leaderError: string;
  leaderLoading: boolean;
  leaderTab: Tab;
  openLeaderboard: (tab: Tab) => void;
  xpRows: LeaderRow[];
};

export default function LeaderboardScreen({ state }: { state: LeaderboardState }) {
  const { eloRows, leaderError, leaderLoading, leaderTab, openLeaderboard, xpRows } = state;
  const own = xpRows.find(row => row.self);
  const samples = xpRows.filter(row => !row.self);
  return (
    <section className="workspace-flow standings">
      <h1 className="workspace-page-title">Leaderboard</h1>
      <p className="workspace-lead">Review your earned XP and the live debate ratings.</p>
      <div className="standings-tabs" role="group" aria-label="Ranking type">
        <button type="button" aria-pressed={leaderTab === "xp"} onClick={() => openLeaderboard("xp")}>Practice XP</button>
        <button type="button" aria-pressed={leaderTab === "elo"} onClick={() => openLeaderboard("elo")}>Live debate ratings</button>
      </div>
      {leaderTab === "xp" ? <>
        <section className="standings-summary">
          <h2>Your practice XP</h2>
          <strong>{own?.score.toLocaleString() ?? "Unavailable"}{own && " XP"}</strong>
          <p className="workspace-meta">All-time XP earned on this device. A live practice ranking is unavailable.</p>
        </section>
        <details className="standings-example">
          <summary>View sample standings</summary>
          <p className="workspace-meta">These sample entries illustrate how standings are displayed.</p>
          <ol className="standings-list">{samples.map(row => <li key={row.name}><span>{row.name}</span><span className="workspace-meta">Sample entry</span><strong>{row.score.toLocaleString()} XP</strong></li>)}</ol>
        </details>
      </> : <>
        <p className="workspace-meta">Live ratings from player profiles, ordered by rating. New profiles start at 1,200.</p>
        {leaderLoading ? <p role="status">Loading live ratings…</p> : leaderError ? <div className="workspace-note" role="status">
          <strong>Live ratings unavailable</strong><p>{leaderError}</p>
          <button className="workspace-text-action" onClick={() => openLeaderboard("elo")}><RefreshCw size={16} /> Retry</button>
        </div> : eloRows.length ? (
          <ol className="standings-list">{eloRows.map((row, index) => (
            <li key={`${row.name}-${index}`}><span>{index + 1}. {row.name}{row.self ? " (you)" : ""}</span><span className="workspace-meta">{row.record}</span><strong>{row.score.toLocaleString()}</strong></li>
          ))}</ol>
        ) : <div className="workspace-empty"><strong>No live ratings yet</strong><p>Completed live debates update player ratings.</p></div>}
      </>}
    </section>
  );
}
