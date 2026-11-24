type ScreenState = Record<string, any>;

export default function StudyScreen({ state }: { state: ScreenState }) {
    const { Study, awardStudyXp, setNotice, setView } = state;
  return <Study key={state.sessionAccountId || "guest"} ownerUid={state.sessionAccountId || "guest"} onAwardXp={awardStudyXp} onTransfer={(screen: string, detail: string)=>{setNotice(detail);setView(screen==="investigation"?"evidence":screen==="ai-debate"?"ai-setup":"home");}} onPrepareAssignment={(draft: Record<string, unknown>)=>{try{sessionStorage.setItem("veritas:study-assignment-draft",JSON.stringify(draft));setNotice("Study lesson draft ready in Classroom.");setView("classroom");}catch{setNotice("Could not prepare a Classroom draft. Please try again.");}}}/>;
}
