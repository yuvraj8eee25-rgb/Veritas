import { useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";
import { achievementDefinitions, dailyQuestDefinitions } from "./arcade";

export default function ArcadeDashboard({ progress }: { progress: Record<string, any> }) {
  const [showAchievements, setShowAchievements] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const questState = progress.quests?.date === today ? progress.quests : { prog: {}, done: [] };
  const done = new Set<string>(questState.done || []);

  return <section className="arcade-dashboard">
    <div className="arcade-head">
      <div><h2>Today&apos;s goals</h2></div>
      <span className="arcade-tally">{done.size}/3 complete</span>
    </div>
    <div className="arcade-quest-list">
      {dailyQuestDefinitions(today).map(quest => {
        const value = Math.min(quest.goal, Number(questState.prog?.[quest.id]) || 0);
        const complete = done.has(quest.id);
        return <article className={`arcade-quest ${complete ? "complete" : ""}`} key={quest.id}>
          <span className="arcade-quest-check" aria-hidden="true">{complete ? "✓" : ""}</span>
          <div className="arcade-quest-body">
            <strong>{quest.text}</strong>
            <div className="arcade-progress" role="progressbar" aria-label={quest.text} aria-valuenow={value} aria-valuemin={0} aria-valuemax={quest.goal}>
              <span style={{ width: `${Math.min(100, value / quest.goal * 100)}%` }} />
            </div>
          </div>
          <span className="arcade-quest-xp">+{quest.xp} XP</span>
        </article>;
      })}
    </div>
    <button className={`arcade-achievements-toggle ${showAchievements ? "open" : ""}`} onClick={() => setShowAchievements(value => !value)} aria-expanded={showAchievements}>
      <span><Trophy size={15}/> Achievements</span><small>{(progress.achievements || []).length} / {achievementDefinitions.length}</small><ChevronDown size={15}/>
    </button>
    {showAchievements && <div className="arcade-achievements">
      {achievementDefinitions.map(item => {
        const unlocked = (progress.achievements || []).includes(item.id);
        return <article className={`arcade-achievement ${unlocked ? "unlocked" : ""}`} key={item.id}>
          <span>{unlocked ? "✦" : "?"}</span><div><strong>{unlocked ? item.name : "Locked"}</strong><small>{item.description}</small></div>
        </article>;
      })}
    </div>}
  </section>;
}
