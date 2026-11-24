import { downloadJson } from "../../lib/download";
import { loadProgress, saveProgress, mergeProgress } from "../../../../app/src/features/practice-state.js";
import LearningLibrary from "../LearningLibrary";
type ScreenState = Record<string, any>;

export default function ProfileViewScreen({ state }: { state: ScreenState }) {
    const { ProfileScreen, badges, guestMode, nameDraft, nameEditing, nextRank, openLeaderboard, openLiveLobby, pct, profile, profileBusy, profileMessage, profileSkills, progress, rank, saveDisplayName, sessionEmail, setGuestMode, setNameDraft, setNameEditing, setProfileMessage, setView, signOut, uploadAvatar, winRate } = state;
  return <><ProfileScreen profile={profile} profileMessage={profileMessage} nameEditing={nameEditing} nameDraft={nameDraft} profileBusy={profileBusy} guestMode={guestMode} sessionEmail={sessionEmail} totalXp={progress.totalXp} totalRuns={progress.totalRuns} streak={progress.streak} activity={(progress.activity||{}) as Record<string,number>} skills={profileSkills} badges={badges} rank={rank} nextRank={nextRank} rankProgress={pct} winRate={winRate} onBack={()=>setView("home")} onPractice={()=>setView("setup")} onFindMatch={()=>void openLiveLobby()} onLeaderboard={()=>void openLeaderboard("xp")} onCreateAccount={()=>setGuestMode(false)} onSignOut={()=>void signOut()} onEditName={()=>{setNameDraft(profile.displayName||sessionEmail?.split("@")[0]||"");setNameEditing(true);setProfileMessage("");}} onSaveName={()=>void saveDisplayName()} onCancelName={()=>setNameEditing(false)} onNameChange={setNameDraft} onUploadAvatar={(file: File)=>{void uploadAvatar(file);}}/><section className="workspace-flow"><h2>Practice evidence</h2>{profileMessage.startsWith("Progress is saved on this device.") && <button className="workspace-secondary" onClick={() => state.setSyncAttempt((value: number) => value + 1)}>Retry progress sync</button>}
    <p>Mastery estimates use {Object.keys(progress.assessments || {}).length} recorded question assessments and their recency. These estimates are not validated measures of general debate ability. XP records practice activity; ELO records live debate results.</p>
    <button className="workspace-secondary" onClick={() => downloadJson("veritas-practice-progress.json", progress)}>Export practice progress</button>
    {!guestMode && <button className="workspace-secondary" onClick={() => {
      if (!window.confirm("Import this device’s guest practice into your signed-in account? Only do this if that practice belongs to you. Best counters are kept without adding duplicate XP.")) return;
      const merged = mergeProgress(progress, loadProgress(localStorage, "guest"));
      if (saveProgress(merged, localStorage, state.sessionAccountId)) { state.setProgressState(merged); setProfileMessage("Guest practice imported into your account’s device progress."); }
      else setProfileMessage("Could not import progress. Export a backup and try again.");
    }}>Import my guest practice</button>}
    </section><LearningLibrary key={state.sessionAccountId || "guest"} owner={state.sessionAccountId || "guest"}/></>;
}
