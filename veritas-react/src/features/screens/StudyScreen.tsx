type ScreenState = Record<string, any>;

export default function StudyScreen({ state }: { state: ScreenState }) {
    const { Study, awardStudyXp, setNotice, setView } = state;
  return <Study onAwardXp={awardStudyXp} onTransfer={(screen: string)=>setView(screen==="investigation"?"evidence":screen==="ai-debate"?"ai-setup":"home")} onPrepareAssignment={(draft: Record<string, unknown>)=>{try{sessionStorage.setItem("veritas:study-assignment-draft",JSON.stringify(draft));setNotice("Study lesson draft ready in Classroom.");setView("classroom");}catch{setNotice("Could not prepare a Classroom draft. Please try again.");}}}/>;
}
