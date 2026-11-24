type Assignment = { id: string; classroom_id: string; max_score?: number };
type Member = { user_id: string; classroom_id: string; display_name: string };
type Submission = { assignment_id: string; student_uid: string; score?: number; graded_at?: string | null };

export function eligibleAssignments(assignments: Assignment[], members: Member[], uid: string) {
  const classrooms = new Set(members.filter(member => member.user_id === uid).map(member => member.classroom_id));
  return assignments.filter(assignment => classrooms.has(assignment.classroom_id));
}

export function normalizedAverage(assignments: Assignment[], submissions: Submission[]) {
  const percentages = submissions.flatMap(submission => {
    const max = assignments.find(assignment => assignment.id === submission.assignment_id)?.max_score;
    return submission.graded_at && Number.isFinite(submission.score) && max && max > 0
      ? [Math.max(0, Math.min(100, submission.score! / max * 100))] : [];
  });
  return percentages.length ? Math.round(percentages.reduce((sum, score) => sum + score, 0) / percentages.length) : null;
}
