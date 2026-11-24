export function classroomTaskState(assignment: {id:string;status:string}, submissions: {assignment_id:string;student_uid:string;attempt_no:number;state:string;graded_at?:string|null}[], coach: boolean, uid: string) {
  const related = submissions.filter(item=>item.assignment_id===assignment.id);
  if (coach) return assignment.status === "draft" ? "drafts" : related.some(item=>["submitted","late"].includes(item.state) && !item.graded_at) ? "review" : "published";
  const latest = related.filter(item=>item.student_uid===uid).sort((a,b)=>b.attempt_no-a.attempt_no)[0];
  return !latest || latest.state === "resubmission-requested" ? "todo" : latest.graded_at || ["graded","returned"].includes(latest.state) ? "feedback" : "submitted";
}
