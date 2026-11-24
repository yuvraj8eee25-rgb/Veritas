export type HomeAssignment = { id: string; title: string; dueAt: string | null; feedback: boolean; resubmission: boolean };
/** Only prioritize published work in cohorts where this user is a learner. */
export function nextClassroomTask(workspace: any, uid: string): HomeAssignment | null {
  const cohorts = new Set((Array.isArray(workspace?.cohorts) ? workspace.cohorts : []).filter((item: any) => item && !item.coach && !item.archived).map((item: any) => item.id));
  const submissions = (Array.isArray(workspace?.submissions) ? workspace.submissions : []).filter((item: any) => item?.student_uid === uid);
  const assignments = (Array.isArray(workspace?.assignments) ? workspace.assignments : []).filter((item: any) => item && typeof item.title === "string" && item.status === "published" && !item.archived && cohorts.has(item.classroom_id));
  const tasks = assignments.map((item: any) => {
    const mine = submissions.filter((submission: any) => submission.assignment_id === item.id).sort((a: any,b: any) => (b.attempt_no ?? 0) - (a.attempt_no ?? 0));
    const latest = mine[0];
    return { id: String(item.id), title: item.title, dueAt: typeof item.due_at === "string" && Number.isFinite(Date.parse(item.due_at)) ? item.due_at : null,
      feedback: Boolean(latest?.graded_at), resubmission: latest?.state === "resubmission-requested", pending: !latest || latest.state === "resubmission-requested" };
  }).filter((item: any) => item.pending || item.feedback).sort((a: any,b: any) => Number(b.pending) - Number(a.pending) || (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity));
  if (!tasks.length) return null;
  const { pending: _pending, ...task } = tasks[0]; return task;
}
