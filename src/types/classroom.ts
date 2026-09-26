/** Data contracts for the Classroom service responses and UI state. */
export type ClassroomRole = "coach" | "student";
export type AssignmentKind = "debate" | "drill" | "position_paper";

export interface ClassroomSummary {
  id: string;
  name: string;
  owner_uid: string;
  organization_name: string | null;
  archived: boolean;
  students: number;
}

export interface ClassroomAssignment {
  id: string;
  classroom_id: string;
  title: string;
  kind: AssignmentKind;
  status: "draft" | "published";
  due_at: string | null;
  max_score: number;
}

export interface ClassroomState {
  user: string;
  role: ClassroomRole;
  cohorts: ClassroomSummary[];
  assignments: ClassroomAssignment[];
}
