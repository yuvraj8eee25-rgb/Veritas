import PeerReview from "./PeerReview";
import { classroomTaskState } from "../lib/classroom-task";
import { discussionRequestId, completeDiscussionRequest } from "../lib/peer-review";
import { csvCell, downloadFile } from "../lib/download";
import { eligibleAssignments, normalizedAverage } from "../lib/classroom-report";
import ChoiceField from "@/components/ChoiceField";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, BookOpen, LoaderCircle, RefreshCw } from "lucide-react";
import { auth } from "../lib/supabase";
import { invokeVeritasFunction } from "../lib/supabase-functions";

type Cohort = { id: string; name: string; role?: string; description?: string; invite_code?: string; owner_uid?: string; organization_id?: string|null; organization_name?: string; students?: number; coach?: boolean; archived?: boolean };
type ClassroomAttachment = { path: string; name: string; mime: string; size: number };
export type Assignment = { id: string; classroom_id: string; title: string; instructions?: string; kind: string; status: string; due_at?: string | null; max_score?: number; rubric?: { name: string; max: number }[]; attempt_limit?: number; allow_late?: boolean; allow_files?: boolean; student_replies?: boolean; archived?: boolean; attachments?: ClassroomAttachment[]; activity_settings?: { topic?: string; mode?: "written" | "speech"; turns?: 3 | 5; speech_seconds?: 60 | 90 | 180; stance?: "for" | "against"; bot?: "sparring" | "rival" | "champion"; drill_mode?: "fallacy" | "rebuttal" | "speed" | "steelman"; difficulty?: "all" | "easy" | "medium" | "hard" } };
type Submission = { id: string; assignment_id: string; student_uid: string; attempt_no: number; content: string; state: string; score?: number; feedback?: string; rubric_scores?: Record<string, number>; attachments?: ClassroomAttachment[]; activity?: Record<string, any>|null; version: number; submitted_at: string; graded_at?: string | null };
type Announcement = { id: string; classroom_id: string; title: string; body: string; pinned: boolean; assignment_id?: string | null; created_at: string; updated_at: string };
type Question = { id: string; assignment_id: string; user_id: string; body: string; created_at: string };
type ClassroomDraft = { assignment_id: string; user_id: string; content: string; updated_at: string };
type GradeDraft = { submission_id: string; data: { rubric_scores?: Record<string, number>; feedback?: string }; updated_at: string };
type Member = { classroom_id: string; user_id: string; role: "coach" | "student"; display_name: string; joined_at: string };
type Invitation = { id: string; classroom_id: string; invited_email?: string|null; role: "coach"|"student"; expires_at: string; revoked_at?: string|null; accepted_uid?: string|null };
type Workspace = { cohorts: Cohort[]; assignments: Assignment[]; announcements: Announcement[]; submissions: Submission[]; questions: Question[]; drafts: ClassroomDraft[]; grade_drafts: GradeDraft[]; reads: { classroom_id: string; read_at: string }[]; members: Member[]; invites: Invitation[]; organizations: Organization[] };
type Organization = { id: string; name: string; owner_uid: string; archived: boolean; created_at: string };

function requestId(assignmentId: string) {
  const key = `veritas-react-submit:${assignmentId}`;
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
}

const assignmentTemplates: Record<string, string> = {
  "PEEL argument structure": "Point, Evidence, Explanation, Link to the motion.",
  "POP speech structure": "Position, Obstacle, Proposal.",
  "Opening statements": "Define the motion, state your position, and preview two arguments.",
  "Rebuttal drills": "Identify the strongest opposing claim. Challenge its evidence and reasoning.",
  "Evidence analysis": "Evaluate credibility, relevance, limitations, and implications of a source.",
  "Diplomatic language": "Acknowledge shared interests and propose a respectful compromise.",
  "Moderated caucus speeches": "Prepare a 60-second speech: position, evidence, policy proposal, invitation to collaborate.",
  "Position papers": "Explain your country’s position, past action, and proposed solutions. Cite your sources.",
};
const allowedAttachmentTypes = new Set(["application/pdf", "text/plain", "image/png", "image/jpeg"]);
function validateAttachment(file: File) {
  if (!file.size) return "The selected file is empty.";
  if (file.size > 5 * 1024 * 1024) return "Attachments are limited to 5 MB.";
  if (!allowedAttachmentTypes.has(file.type)) return "Attachments must be PDF, TXT, PNG, or JPG files.";
  return "";
}
function safeFileName(name: string) { return name.replace(/[\\/\0-\x1f]/g, "_").slice(0, 180) || "attachment"; }
async function uploadAttachment(assignmentId: string, file: File, scope: "assignment" | "submission", submitRequestId?: string) {
  if (!auth) throw new Error("Connect Supabase before uploading files.");
  const invalid = validateAttachment(file);
  if (invalid) throw new Error(invalid);
  const { data: userData, error: userError } = await auth.auth.getUser();
  if (userError || !userData.user) throw new Error("Sign in again before uploading an attachment.");
  const folder = scope === "assignment" ? "assignment" : submitRequestId;
  if (!folder) throw new Error("Submission request is missing.");
  const attachment = { path: `${userData.user.id}/${assignmentId}/${folder}/${crypto.randomUUID()}`, name: safeFileName(file.name), mime: file.type, size: file.size };
  const { error } = await auth.storage.from("classroom-attachments").upload(attachment.path, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
  if (error) throw error;
  return attachment;
}
async function downloadAttachment(file: ClassroomAttachment, assignmentId: string, submissionId?: string) {
  if (!auth) throw new Error("Connect Supabase before downloading files.");
  if (submissionId) {
    const { data, error } = await auth.rpc("authorize_classroom_attachment", { p_submission_id: submissionId, p_path: file.path });
    if (error || !data) throw error || new Error("You no longer have access to this attachment.");
  } else {
    const { data, error } = await auth.rpc("authorize_classroom_assignment_attachment", { p_assignment_id: assignmentId, p_path: file.path });
    if (error || !data) throw error || new Error("You no longer have access to this attachment.");
  }
  const { data, error } = await auth.storage.from("classroom-attachments").createSignedUrl(file.path, 300);
  if (error || !data?.signedUrl) throw error || new Error("Could not create a download link.");
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

type GradeMode = "draft" | "returned" | "graded";
type GradeRequest = {
  submission: string;
  version: number;
  score: number;
  rubric_scores: Record<string, number>;
  feedback: string;
  mode: GradeMode;
};

const submissionLabels: Record<string, string> = {
  submitted: "Submitted",
  late: "Late",
  graded: "Graded",
  returned: "Returned",
  "resubmission-requested": "Resubmission requested",
};

function ReviewSubmission({ submission, assignment, initialDraft, onSave, onDownload }: {
  submission: Submission;
  assignment: Assignment;
  initialDraft?: GradeDraft["data"];
  onSave: (data: GradeRequest) => Promise<void>;
  onDownload: (file: ClassroomAttachment) => void;
}) {
  const feedbackId = useId();
  const maxScore = assignment.max_score ?? 10;
  const categories = assignment.rubric?.length ? assignment.rubric : [{ name: "Reasoning", max: maxScore }];
  const [scores, setScores] = useState<Record<string, string>>(() => Object.fromEntries(categories.map(item => [
    item.name, String(initialDraft?.rubric_scores?.[item.name] ?? submission.rubric_scores?.[item.name] ?? ""),
  ])));
  const [feedback, setFeedback] = useState(initialDraft?.feedback ?? submission.feedback ?? "");
  const [busy, setBusy] = useState<GradeMode | null>(null);
  const [error, setError] = useState("");

  const blank = categories.some(item => scores[item.name].trim() === "");
  const rubricScores = Object.fromEntries(categories.map(item => [item.name, Number(scores[item.name])]));
  const valid = categories.every(item => {
    const score = rubricScores[item.name];
    return Number.isFinite(score) && score >= 0 && score <= item.max && score === Number(score.toFixed(2));
  });
  const total = categories.reduce((sum, item) => sum + Math.round((rubricScores[item.name] || 0) * 100), 0) / 100;
  const withinMaximum = valid && total <= maxScore;
  const editable = ["submitted", "late", "returned", "resubmission-requested"].includes(submission.state);

  async function save(mode: GradeMode) {
    if (busy || !withinMaximum || (blank && mode !== "draft")) return;
    setError("");
    setBusy(mode);
    try {
      await onSave({ submission: submission.id, version: submission.version, score: total, rubric_scores: rubricScores, feedback, mode });
    } catch (cause) {
      const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string" ? cause.message : "The grade could not be saved. Try again.";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="classroom-review">
      <summary>Attempt {submission.attempt_no} · <span className="classroom-state" data-state={submission.state}>{submissionLabels[submission.state] || submission.state}</span> · {new Date(submission.submitted_at).toLocaleDateString()}</summary>
      <p className="classroom-review-content">{submission.content}</p>
      {submission.attachments?.map(file => <button type="button" className="button button-secondary" key={file.path} onClick={() => onDownload(file)}>Download {file.name}</button>)}
      {editable ? (
        <div className="classroom-grade-form">
          <fieldset className="classroom-rubric-inputs" disabled={Boolean(busy)}>
            <legend>Rubric scores</legend>
            {categories.map(item => (
              <label key={item.name}>{item.name} (/{item.max})
                <input type="number" min="0" max={item.max} step="0.01" value={scores[item.name]}
                  onChange={event => setScores(current => ({ ...current, [item.name]: event.target.value }))} />
              </label>
            ))}
          </fieldset>
          <p className="workspace-meta" role="status">Total {total} / {maxScore}</p>
          {!withinMaximum ? <p className="workspace-error" role="alert">Use up to two decimal places and keep each score within its rubric range and the assignment maximum.</p>
            : blank && <p className="workspace-meta">Enter every score to publish or return this attempt. Blank scores count as zero in a private draft.</p>}
          <div className="workspace-field">
            <label htmlFor={feedbackId}>Feedback for the student</label>
            <textarea id={feedbackId} rows={4} value={feedback} maxLength={4000} disabled={Boolean(busy)} onChange={event => setFeedback(event.target.value)} />
          </div>
          {error && <p className="workspace-error" role="alert">{error}</p>}
          <div className="classroom-grade-actions">
            <button type="button" className="button button-secondary" disabled={Boolean(busy) || !withinMaximum} onClick={() => void save("draft")}>{busy === "draft" ? "Saving…" : "Save private draft"}</button>
            <button type="button" className="button button-secondary" disabled={Boolean(busy) || !withinMaximum || blank} onClick={() => void save("returned")}>{busy === "returned" ? "Returning…" : "Return with feedback"}</button>
            <button type="button" className="button button-primary" disabled={Boolean(busy) || !withinMaximum || blank} onClick={() => void save("graded")}>{busy === "graded" ? "Publishing…" : "Publish grade"}</button>
          </div>
        </div>
      ) : (
        <div className="classroom-published-grade"><strong>{submission.score}/{maxScore}</strong><p>{submission.feedback}</p></div>
      )}
    </details>
  );
}

export default function Classroom({ onLaunchDrill, onLaunchAiDebate, onLaunchLiveDebate }: { onLaunchDrill: (assignment: Assignment) => void; onLaunchAiDebate: (assignment: Assignment) => void; onLaunchLiveDebate: (assignment: Assignment) => void }) {
  const [workspace, setWorkspace] = useState<Workspace>({ cohorts: [], assignments: [], announcements: [], submissions: [], questions: [], drafts: [], grade_drafts: [], reads: [], members: [], invites: [], organizations: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [message, setMessage] = useState("");
  const [activeCohort, setActiveCohort] = useState("all");
  const [panel, setPanel] = useState("assignments");
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [uid, setUid] = useState("");
  const [createCohort, setCreateCohort] = useState(false);
  const [cohortDraft, setCohortDraft] = useState({ name: "", description: "" });
  const [cohortOrganization, setCohortOrganization] = useState("");
  const [organizationDraft, setOrganizationDraft] = useState("");
  const [assignmentCohort, setAssignmentCohort] = useState("");
  const [assignmentDraft, setAssignmentDraft] = useState({ title: "", instructions: "", due: "" });
  const [studyDraftLoaded, setStudyDraftLoaded] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [assignmentKind, setAssignmentKind] = useState<"position_paper" | "drill" | "ai_debate" | "live_debate" | "private_debate">("position_paper");
  const [assignmentMode, setAssignmentMode] = useState<"written" | "speech">("written");
  const [assignmentTurns, setAssignmentTurns] = useState<3 | 5>(3);
  const [assignmentSpeechSeconds, setAssignmentSpeechSeconds] = useState(90);
  const [assignmentStatus, setAssignmentStatus] = useState<"draft" | "published">("draft");
  const [attemptLimit, setAttemptLimit] = useState(3);
  const [maxScore, setMaxScore] = useState(10);
  const [rubricDraft, setRubricDraft] = useState("Reasoning and evidence | 10");
  const [allowLate, setAllowLate] = useState(false);
  const [studentReplies, setStudentReplies] = useState(true);
  const [drillMode, setDrillMode] = useState<NonNullable<Assignment["activity_settings"]>["drill_mode"]>("fallacy");
  const [drillDifficulty, setDrillDifficulty] = useState<NonNullable<Assignment["activity_settings"]>["difficulty"]>("all");
  const [allowFiles, setAllowFiles] = useState(false);
  const [assignmentFile, setAssignmentFile] = useState<File|null>(null);
  const [announcementCohort, setAnnouncementCohort] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState({ title: "", body: "" });
  const [questionDrafts, setQuestionDrafts] = useState<Record<string, string>>({});
  const [questionBusy, setQuestionBusy] = useState("");
  const discussionPosting = useRef(new Set<string>());
  const [inviteCohort, setInviteCohort] = useState("");
  const [inviteDraft, setInviteDraft] = useState({ email: "", role: "student" as "student"|"coach", expires: new Date(Date.now()+14*86400000).toISOString().slice(0,10) });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState("");
  const [saving, setSaving] = useState(false);
  const [submissionDrafts, setSubmissionDrafts] = useState<Record<string, string>>({});
  const [submissionFiles, setSubmissionFiles] = useState<Record<string, File[]>>({});
  const [draftStatus, setDraftStatus] = useState<Record<string,string>>({});
  const [submitting, setSubmitting] = useState("");

  const load = useCallback(async () => {
    if (!auth) { setError("Connect Supabase to open Classroom."); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const token = new URLSearchParams(window.location.search).get("classroom_invite");
      if (token) {
        await command("join", { token });
        const clean = new URL(window.location.href); clean.searchParams.delete("classroom_invite"); window.history.replaceState({}, "", clean);
        setMessage("Invitation accepted. You joined the classroom.");
      }
      const [{ data, error: rpcError }, { data: userData }] = await Promise.all([
        auth.rpc("classroom_command", { p_action: "workspace", p_data: {} }), auth.auth.getUser(),
      ]);
      if (rpcError) throw rpcError;
      setUid(userData.user?.id || "");
      setWorkspace({ cohorts: data?.cohorts || [], assignments: data?.assignments || [], announcements: data?.announcements || [], submissions: data?.submissions || [], questions: data?.questions || [], drafts: data?.drafts || [], grade_drafts: data?.grade_drafts || [], reads: data?.reads || [], members: data?.members || [], invites: data?.invites || [], organizations: data?.organizations || [] });
      setSubmissionDrafts(current=>Object.keys(current).length?current:Object.fromEntries((data?.drafts||[]).filter((draft:any)=>draft.user_id===userData.user?.id).map((draft:any)=>[draft.assignment_id,draft.content])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load your classrooms."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void load();
    try {
      const pending = JSON.parse(sessionStorage.getItem("veritas:study-assignment-draft") || "null");
      if (pending && typeof pending.title === "string" && typeof pending.instructions === "string") {
        setAssignmentDraft(current => ({ ...current, title: pending.title, instructions: pending.instructions }));
        setAssignmentKind(pending.kind === "drill" ? "drill" : "position_paper");
        setAssignmentStatus("draft");
        setMessage("Study lesson loaded as a draft. Choose your classroom and review it before saving.");
        setStudyDraftLoaded(true);
      }
    } catch { /* ignore an invalid tab-scoped handoff */ }
  }, [load]);

  useEffect(() => {
    if (!studyDraftLoaded || assignmentCohort) return;
    const coachCohort = workspace.cohorts.find(cohort => cohort.coach && !cohort.archived);
    if (coachCohort) setAssignmentCohort(coachCohort.id);
  }, [studyDraftLoaded, assignmentCohort, workspace.cohorts]);

  useEffect(() => {
    if (!auth||!uid) return;
    const pending=Object.entries(submissionDrafts).filter(([assignmentId,content])=>assignmentId!==submitting&&Boolean((content.trim()||workspace.drafts.some(draft=>draft.assignment_id===assignmentId))&&workspace.assignments.some(assignment=>assignment.id===assignmentId&&assignment.status==="published"&&!assignment.archived)&&workspace.cohorts.some(cohort=>cohort.id===workspace.assignments.find(assignment=>assignment.id===assignmentId)?.classroom_id&&!cohort.coach)));
    if (!pending.length) return;
    const timer=window.setTimeout(async()=>{
      for(const [assignmentId,content] of pending){
        setDraftStatus(current=>({...current,[assignmentId]:"Saving draft…"}));
        const {error:draftError}=await auth!.rpc("classroom_command",{p_action:"draft",p_data:{assignment:assignmentId,content}});
        setDraftStatus(current=>({...current,[assignmentId]:draftError?"Draft not saved":"Draft saved"}));
      }
    },700);
    return ()=>window.clearTimeout(timer);
  },[submissionDrafts,submitting,uid,workspace.assignments,workspace.cohorts,workspace.drafts]);

  async function command(action: string, data: any) {
    if (!auth) throw new Error("Connect Supabase to use Classroom.");
    const { data: result, error: rpcError } = await auth.rpc("classroom_command", { p_action: action, p_data: data });
    if (rpcError) throw rpcError;
    return result;
  }
  async function join() {
    if (!auth || code.trim().length !== 8) { setMessage("Enter the eight-character classroom code."); return; }
    setJoining(true); setMessage("");
    try { await command("join", { code: code.trim().toUpperCase() }); setCode(""); setMessage("You joined the classroom."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not join this classroom."); }
    finally { setJoining(false); }
  }
  async function makeCohort(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    try { await command("cohort", { ...cohortDraft, organization: cohortOrganization || null }); setCreateCohort(false); setCohortDraft({ name: "", description: "" }); setCohortOrganization(""); setMessage("Classroom created. Share its invite code with students."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not create the classroom."); }
    finally { setSaving(false); }
  }
  async function makeAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!assignmentCohort) return;
    const rubric = rubricDraft.split(/\r?\n/).filter(line => line.trim()).map(line => { const separator = line.lastIndexOf("|"); return { name: line.slice(0, separator).trim(), max: Number(line.slice(separator + 1).trim()) }; });
    if (rubric.length < 1 || rubric.length > 12 || rubric.some(item => !item.name || item.name.length > 100 || !Number.isFinite(item.max) || item.max <= 0)) { setMessage("Enter 1–12 rubric categories as Name | points, with positive points for each."); return; }
    if (new Set(rubric.map(item => item.name)).size !== rubric.length) { setMessage("Rubric category names must be unique."); return; }
    if (rubric.reduce((sum, item) => sum + item.max, 0) !== maxScore) { setMessage("Rubric points must total the maximum score."); return; }
    if (!Number.isInteger(attemptLimit) || attemptLimit < 1 || attemptLimit > 10) { setMessage("Attempt limit must be between 1 and 10."); return; }
    setSaving(true); setMessage("");
    const due_at = assignmentDraft.due ? new Date(`${assignmentDraft.due}T23:59:00`).toISOString() : null;
    try {
      const result = await command("assignment", { cohort: assignmentCohort, assignment: editingAssignment?.id, kind: assignmentKind, title: assignmentDraft.title, instructions: assignmentDraft.instructions, status: assignmentStatus, due_at, attempt_limit: attemptLimit, max_score: maxScore, rubric, allow_late: allowLate, allow_files: allowFiles, student_replies: studentReplies, activity_settings: { ...editingAssignment?.activity_settings, topic: assignmentDraft.title, mode: assignmentMode, turns: assignmentTurns, speech_seconds: assignmentSpeechSeconds, drill_mode: drillMode, difficulty: drillDifficulty } });
      if (assignmentFile && result?.id) {
        const file = await uploadAttachment(result.id, assignmentFile, "assignment");
        const { error: registerError } = await auth!.rpc("register_classroom_assignment_attachment", { p_assignment_id: result.id, p_file: file });
        if (registerError) throw registerError;
      }
      if (studyDraftLoaded) sessionStorage.removeItem("veritas:study-assignment-draft");
      setAssignmentCohort(""); setAssignmentDraft({ title: "", instructions: "", due: "" }); setAssignmentKind("position_paper"); setDrillMode("fallacy"); setDrillDifficulty("all"); setAssignmentMode("written"); setAssignmentTurns(3); setAssignmentSpeechSeconds(90); setAssignmentStatus("published"); setAttemptLimit(3); setMaxScore(10); setRubricDraft("Reasoning and evidence | 10"); setAllowLate(false); setAllowFiles(false); setStudentReplies(true); setAssignmentFile(null); setMessage(`${editingAssignment ? "Assignment updated" : assignmentKind === "drill" ? "Practice drill" : assignmentKind.endsWith("debate") ? "Debate assignment" : "Position paper assignment"} saved.`); setEditingAssignment(null); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not publish the assignment."); }
    finally { setSaving(false); }
  }
  async function submitPositionPaper(assignment: Assignment) {
    const content = (submissionDrafts[assignment.id] || "").trim();
    if (content.length < 20) { setMessage("Add at least 20 characters to your response."); return; }
    setSubmitting(assignment.id); setMessage("");
    try {
      const id = requestId(assignment.id);
      const files = await Promise.all((submissionFiles[assignment.id]||[]).map(file=>uploadAttachment(assignment.id, file, "submission", id)));
      const submission = await command("submit", { assignment: assignment.id, content, request_id: id });
      if (files.length) {
        const { error: registerError } = await auth!.rpc("register_classroom_attachments", { p_submission_id: submission.id, p_files: files });
        if (registerError) throw registerError;
      }
      sessionStorage.removeItem(`veritas-react-submit:${assignment.id}`);
      setSubmissionDrafts(current => ({ ...current, [assignment.id]: "" })); setSubmissionFiles(current => ({ ...current, [assignment.id]: [] })); setMessage("Your response was submitted to your coach."); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not submit your response."); }
    finally { setSubmitting(""); }
  }
  async function gradeSubmission(data: GradeRequest) {
    await command("grade", data);
    setMessage(data.mode === "draft" ? "Private grade draft saved." : data.mode === "returned" ? "Attempt returned with feedback." : "Grade saved and published.");
    await load();
  }
  async function publishAnnouncement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!announcementCohort) return;
    setSaving(true); setMessage("");
    try { await command("announcement", { cohort: announcementCohort, title: announcementDraft.title.trim(), body: announcementDraft.body.trim(), pinned: false }); setAnnouncementDraft({ title: "", body: "" }); setAnnouncementCohort(""); setMessage("Announcement published."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not publish the announcement."); }
    finally { setSaving(false); }
  }
  async function postDiscussion(assignment: Assignment, body: string) {
    if (!auth || !uid) throw new Error("Sign in again before posting.");
    if (discussionPosting.current.has(assignment.id)) throw new Error("Wait for the current discussion post to finish.");
    discussionPosting.current.add(assignment.id);
    try {
      const pending = discussionRequestId(sessionStorage, uid, assignment.id, body, () => crypto.randomUUID());
      const { error } = await auth.rpc("post_classroom_discussion", { p_assignment: assignment.id, p_request_id: pending.id, p_body: body });
      if (error) throw new Error(error.message || "Could not post to the discussion.");
      completeDiscussionRequest(sessionStorage, pending.key, pending.id);
      await load();
    } finally { discussionPosting.current.delete(assignment.id); }
  }
  async function postQuestion(event: React.FormEvent<HTMLFormElement>, assignment: Assignment) {
    event.preventDefault();
    const body = questionDrafts[assignment.id]?.trim() || "";
    if (!body) return;
    setQuestionBusy(assignment.id); setMessage("");
    try { await postDiscussion(assignment, body); setQuestionDrafts(current => ({ ...current, [assignment.id]: "" })); setMessage("Your discussion post was added."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not post to the discussion."); }
    finally { setQuestionBusy(""); }
  }
  async function markRead(cohortId: string) {
    try { await command("read", { cohort: cohortId }); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not mark announcements as read."); }
  }
  async function togglePinned(item: Announcement) {
    try { await command("announcement", { cohort: item.classroom_id, id: item.id, title: item.title, body: item.body, pinned: !item.pinned, assignment: item.assignment_id }); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not update the announcement."); }
  }
  async function deleteAnnouncement(item: Announcement) {
    try { await command("announcement", { cohort: item.classroom_id, id: item.id, operation: "delete" }); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not delete the announcement."); }
  }
  async function moderateQuestion(question: Question) {
    const assignment = workspace.assignments.find(item => item.id === question.assignment_id);
    if (!assignment) return;
    try { await command("moderate", { assignment: assignment.id, id: question.id }); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not remove the discussion post."); }
  }
  async function createInvite(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!inviteCohort) return;
    setInviteBusy(true); setMessage(""); setInviteLink("");
    try {
      const expires = new Date(`${inviteDraft.expires}T23:59:00`).toISOString();
      const result = await command("invite", { cohort: inviteCohort, email: inviteDraft.email.trim() || null, role: inviteDraft.role, expires });
      if (!result?.token || !result?.id) throw new Error("The invite was created without a shareable link.");
      const url = new URL("/", window.location.origin); url.searchParams.set("classroom_invite", result.token);
      setInviteLink(url.href);
      if (inviteDraft.email.trim()) {
        try {
          const delivery:any = await invokeVeritasFunction("classroom-service", { action: "email", invite: result.id, token: result.token, url: url.href });
          if (delivery?.error) throw new Error(delivery.error);
          setMessage("Invitation created and email sent.");
        } catch (emailError) {
          setMessage(`Invitation link created, but email could not be sent: ${emailError instanceof Error ? emailError.message : "email service unavailable"}`);
        }
      } else setMessage("Invitation link created. Copy it and share it with the member.");
      setInviteDraft(current=>({...current,email:""})); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not create the invitation."); }
    finally { setInviteBusy(false); }
  }
  async function revokeInvite(invite: Invitation) {
    try { await command("revoke", { cohort: invite.classroom_id, id: invite.id }); setMessage("Invitation revoked."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not revoke the invitation."); }
  }
  async function changeMemberRole(member: Member, role: "coach"|"student"|"remove") {
    try { await command("member", { cohort: member.classroom_id, user: member.user_id, role }); setMessage(role==="remove"?"Member removed.":"Member role updated."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not update the member."); }
  }
  async function createOrganization(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setMessage("");
    try { await command("organization", { name: organizationDraft.trim() }); setOrganizationDraft(""); setMessage("Organization created."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not create the organization."); }
    finally { setSaving(false); }
  }
  async function archiveCohort(cohort: Cohort) {
    try { await command("cohort", { cohort: cohort.id, name: cohort.name, description: cohort.description||"", archived: !cohort.archived }); setMessage(cohort.archived?"Classroom restored.":"Classroom archived."); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not update the classroom."); }
  }
  async function leaveCohort(cohort: Cohort) {
    if (!window.confirm(`Leave ${cohort.name}? You will lose access to its assignments and discussions.`)) return;
    try { await command("leave", { cohort: cohort.id }); setMessage("You left the classroom."); setActiveCohort("all"); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not leave the classroom."); }
  }
  async function deleteEmptyCohort(cohort: Cohort) {
    if (!window.confirm(`Delete ${cohort.name}? The server only permits this when the classroom has no other members or assignments.`)) return;
    try { await command("cohort", { cohort: cohort.id, delete: true }); setMessage("Empty classroom deleted."); setActiveCohort("all"); await load(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not delete the classroom."); }
  }

  const cohorts = workspace.cohorts || [];
  const visibleCohorts = activeCohort === "all" ? cohorts : cohorts.filter(c => c.id === activeCohort);
  const coachCohorts = cohorts.filter(c=>c.coach&&!c.archived);
  const assignments = (workspace.assignments || []).filter(a => { const cohort=cohorts.find(c=>c.id===a.classroom_id); return (!a.archived || (showArchived && cohort?.coach)) && (!cohort?.archived || (showArchived && cohort.coach)) && (a.status === "published" || cohort?.coach) && (activeCohort === "all" || a.classroom_id === activeCohort); });
  const hasTeacherRole = visibleCohorts.some(cohort=>cohort.coach);
  const hasLearnerRole = visibleCohorts.some(cohort=>!cohort.coach);
  const taskState = (assignment: Assignment) => classroomTaskState(assignment,workspace.submissions,Boolean(cohorts.find(cohort=>cohort.id===assignment.classroom_id)?.coach),uid);
  const taskFilters = [{id:"all",label:"All work"},...(hasLearnerRole?[{id:"todo",label:"To do"},{id:"feedback",label:"Feedback"},{id:"submitted",label:"Submitted"}]:[]),...(hasTeacherRole?[{id:"review",label:"Needs review"},{id:"drafts",label:"Drafts"}]:[])];
  const filteredAssignments = assignments.filter(assignment=>assignmentFilter==="all" || taskState(assignment)===assignmentFilter).sort((a,b)=>{
    const priority = (item: Assignment) => ({review:0,todo:1,feedback:2,drafts:3,submitted:4,published:5}[taskState(item)]);
    return priority(a)-priority(b) || (a.due_at ? Date.parse(a.due_at) : Infinity)-(b.due_at ? Date.parse(b.due_at) : Infinity);
  });
  const cohortName = (id: string) => cohorts.find(c => c.id === id)?.name || "Classroom";
  const reportAssignments = assignments.filter(a=>!a.archived&&a.status==="published");
  const reportSubmissions = workspace.submissions.filter(sub=>reportAssignments.some(a=>a.id===sub.assignment_id));
  const reportStudents = workspace.members.filter(member=>member.role==="student"&&(activeCohort==="all"||member.classroom_id===activeCohort));
  const gradedSubmissions = reportSubmissions.filter(sub=>sub.graded_at&&typeof sub.score==="number");
  const reportRows = [...new Map(reportStudents.map(member=>[member.user_id,member])).values()].map(member=>{
    const eligible = eligibleAssignments(reportAssignments, reportStudents, member.user_id);
    const mine=reportSubmissions.filter(sub=>sub.student_uid===member.user_id && eligible.some(a=>a.id===sub.assignment_id));
    const complete=new Set(mine.map(sub=>sub.assignment_id)).size;
    const onTime=mine.filter(sub=>{const assignment=reportAssignments.find(a=>a.id===sub.assignment_id);return !assignment?.due_at||sub.submitted_at<=assignment.due_at;}).length;
    return {name:member.display_name,complete,eligible:eligible.length,rate:eligible.length?Math.round(complete/eligible.length*100):0,attempts:mine.length,onTime};
  });
  const drillSubmissions=reportSubmissions.filter(sub=>sub.activity?.resultType==="server-scored");
  const averageScore = normalizedAverage(reportAssignments, gradedSubmissions);

  return <section className="classroom-react-page"><div className="classroom-react-heading"><div><span className="eyebrow">{coachCohorts.length ? "COACH WORKSPACE" : "STUDENT WORKSPACE"}</span><h1>Classroom</h1><p>{coachCohorts.length ? "Create assignments, review submissions, and support your cohorts." : "Find assigned work, deadlines, submissions, and feedback."}</p></div><button className="classroom-refresh" onClick={() => void load()} disabled={loading} aria-label="Refresh classroom data">{loading ? <LoaderCircle className="spinner" size={16}/> : <RefreshCw size={16}/>}</button></div>
    {message && <p role="status" className="classroom-react-message">{message}</p>}
    {error && <div className="classroom-react-error" role="alert"><p>{error}</p><button className="button button-secondary" onClick={() => void load()}>Try again</button></div>}
    <details className="classroom-access" open={(!loading&&!cohorts.length)||createCohort}><summary>Join or create a classroom</summary>
    <section className="classroom-join-card"><div><h2>Have an invite code?</h2><p>Enter the eight-character code shared by your teacher or coach.</p></div><div className="classroom-join-form"><label className="sr-label" htmlFor="classroom-invite-code">Invite code</label><input id="classroom-invite-code" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8))} placeholder="ABCD2345" maxLength={8}/><button className="button button-primary" onClick={() => void join()} disabled={joining || code.length !== 8}>{joining ? "Joining…" : <>Join classroom <ArrowRight size={15}/></>}</button></div><button className="classroom-create-link" onClick={() => setCreateCohort(value => !value)}>{createCohort ? "Cancel classroom setup" : "+ Create a classroom"}</button>{createCohort && <form className="classroom-create-form" onSubmit={makeCohort}><input required maxLength={80} value={cohortDraft.name} onChange={e => setCohortDraft({ ...cohortDraft, name: e.target.value })} aria-label="Classroom name" placeholder="Classroom name"/><textarea maxLength={240} value={cohortDraft.description} onChange={e => setCohortDraft({ ...cohortDraft, description: e.target.value })} aria-label="Short description (optional)" placeholder="Short description (optional)"/><ChoiceField label="Organization (optional)" value={cohortOrganization} options={[{ value: "", label: "Independent classroom" }, ...workspace.organizations.filter(org => !org.archived).map(org => ({ value: org.id, label: org.name }))]} onChange={setCohortOrganization} /><button className="button button-primary" disabled={saving||cohortDraft.name.trim().length<2}>{saving ? "Creating…" : "Create classroom"}</button></form>}</section>
    </details>

    <div className="classroom-context"><ChoiceField label="Classroom" value={activeCohort} options={[{value:"all",label:"All classrooms"},...cohorts.map(cohort=>({value:cohort.id,label:cohort.name}))]} onChange={value=>{setActiveCohort(value);setAssignmentFilter("all");setPanel("assignments");}}/><div><span className="workspace-meta">{activeCohort==="all"?"Your role is shown on each classroom below.":visibleCohorts[0]?.coach?"You’re teaching this classroom.":"You’re a learner in this classroom."}</span>{coachCohorts.length>0&&<button className="workspace-text-action" onClick={()=>setShowArchived(value=>!value)}>{showArchived?"Hide archived":"Show archived"}</button>}</div></div>

    <div className="classroom-cohort-strip">{cohorts.map(c => <button key={c.id} className={activeCohort === c.id ? "active" : ""} onClick={() => {setActiveCohort(c.id);setAssignmentFilter("all");setPanel("assignments");}}><strong>{c.name}</strong><small>{c.coach ? "Coach" : "Student"}{c.invite_code ? ` · code ${c.invite_code}` : ""}</small></button>)}{cohorts.some(c => c.coach && !c.archived) && <button className="classroom-add-assignment" onClick={() => {setPanel("assignments");setAssignmentFilter("all");setEditingAssignment(null);setAssignmentKind("position_paper");setAssignmentStatus("draft");setAttemptLimit(3);setMaxScore(10);setRubricDraft("Reasoning and evidence | 10");setAllowLate(false);setAllowFiles(false);setStudentReplies(true);setAssignmentDraft({title:"",instructions:"",due:""});setAssignmentCohort(activeCohort !== "all" && cohorts.find(c=>c.id===activeCohort)?.coach ? activeCohort : cohorts.find(c=>c.coach&&!c.archived)!.id);}}>+ New assignment</button>}{!cohorts.length && <p>You are not in a cohort yet. Join one with an invite code above.</p>}</div>

    <nav className="studio-tabs" aria-label="Classroom sections">{[{id:"assignments",label:"Assignments"},{id:"announcements",label:"Announcements"},{id:"discussion",label:"Discussion"},{id:"people",label:"People & invitations"},...(coachCohorts.length?[{id:"progress",label:"Progress reports"}]:[])].map(item=><button type="button" key={item.id} aria-pressed={panel===item.id} onClick={()=>setPanel(item.id)}>{item.label}</button>)}</nav>

    <div hidden={panel!=="assignments"}>
    <div className="classroom-task-heading"><h2>{hasTeacherRole?"Assignments & review":"Your assignments"}</h2><p id="classroom-attachment-disclosure" className="workspace-meta">Selected files upload to private classroom storage when you save or send.</p></div><div className="classroom-task-filters" role="group" aria-label="Assignment status">{taskFilters.map(filter=><button type="button" key={filter.id} aria-pressed={assignmentFilter===filter.id} onClick={()=>setAssignmentFilter(filter.id)}>{filter.label}<span>{filter.id==="all"?assignments.length:assignments.filter(item=>taskState(item)===filter.id).length}</span></button>)}</div>

    {assignmentCohort && <form className="classroom-create-form classroom-assignment-form" onSubmit={makeAssignment}><div><span className="eyebrow">NEW ASSIGNMENT · {cohortName(assignmentCohort)}</span><h3>{editingAssignment?"Edit assignment":assignmentKind === "drill" ? "Practice drill" : assignmentKind === "ai_debate" ? "AI debate" : assignmentKind === "live_debate" ? "Live debate" : assignmentKind === "private_debate" ? "Private debate" : "Position paper"}</h3></div><ChoiceField label="Start from template" value={""} options={[{ value: "", label: "Choose a starting point" }, ...Object.keys(assignmentTemplates).map(template => ({ value: template, label: template }))]} onChange={template => { if (template) setAssignmentDraft(current => ({ ...current, instructions: assignmentTemplates[template] })); }} /><ChoiceField label="Assignment type" value={assignmentKind} options={[{ value: "position_paper", label: "Position paper" }, { value: "drill", label: "Assigned practice drill" }, { value: "ai_debate", label: "AI debate practice" }, { value: "live_debate", label: "Assigned live debate" }, { value: "private_debate", label: "Assigned private debate" }]} onChange={setAssignmentKind} />{(assignmentKind === "ai_debate"||assignmentKind === "live_debate"||assignmentKind === "private_debate") && <div className="classroom-drill-options"><ChoiceField label="Debate format" value={assignmentMode} options={[{ value: "written", label: "Written debate" }, { value: "speech", label: "Recorded speech" }]} onChange={setAssignmentMode} /><ChoiceField label="Turns per side" value={assignmentTurns} options={[{ value: 3, label: "3 turns" }, { value: 5, label: "5 turns" }]} onChange={setAssignmentTurns} />{assignmentMode==="speech"&&<ChoiceField label="Speech length" value={assignmentSpeechSeconds} options={[{ value: 60, label: "60 seconds" }, { value: 90, label: "90 seconds" }, { value: 180, label: "3 minutes" }]} onChange={setAssignmentSpeechSeconds} />}</div>}{assignmentKind === "drill" && <div className="classroom-drill-options"><ChoiceField label="Drill format" value={drillMode ?? "fallacy"} options={[{ value: "fallacy", label: "Fallacy Hunter" }, { value: "rebuttal", label: "Rebuttal Practice" }, { value: "speed", label: "Quick Drills" }, { value: "steelman", label: "Steelman Challenge" }]} onChange={setDrillMode} /><ChoiceField label="Difficulty" value={drillDifficulty ?? "all"} options={[{ value: "all", label: "All levels" }, { value: "easy", label: "Easy" }, { value: "medium", label: "Medium" }, { value: "hard", label: "Hard" }]} onChange={setDrillDifficulty} /></div>}<label>Assignment title<input required maxLength={120} value={assignmentDraft.title} onChange={e=>setAssignmentDraft({...assignmentDraft,title:e.target.value})} placeholder="Assignment title"/></label><label>Instructions<textarea required maxLength={10000} value={assignmentDraft.instructions} onChange={e=>setAssignmentDraft({...assignmentDraft,instructions:e.target.value})} placeholder="Claim, length, sources, and expectations"/></label><label>Assignment attachment (PDF, TXT, PNG, JPG · 5 MB)<input type="file" aria-describedby="classroom-attachment-disclosure" accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={event=>setAssignmentFile(event.target.files?.[0]||null)}/></label>{assignmentFile&&<small>Selected: {assignmentFile.name}</small>}<ChoiceField label="Visibility" value={assignmentStatus} options={[{ value: "draft", label: "Draft · coaches only" }, { value: "published", label: "Published · visible to students" }]} onChange={setAssignmentStatus} /><div className="classroom-drill-options"><label>Attempt limit (1–10)<input type="number" min={1} max={10} step={1} value={attemptLimit} onChange={event=>setAttemptLimit(Number(event.target.value))}/></label><label>Maximum score<input type="number" min={1} max={10000} step="0.01" value={maxScore} onChange={event=>setMaxScore(Number(event.target.value))}/></label></div><label>Rubric · one category per line, Name | points<textarea required value={rubricDraft} onChange={event=>setRubricDraft(event.target.value)} rows={4} placeholder="Reasoning | 5&#10;Evidence | 5"/></label><small>Rubric points must add up to {maxScore}.</small><label><input type="checkbox" checked={allowLate} onChange={event=>setAllowLate(event.target.checked)}/> Allow late submissions</label><label><input type="checkbox" checked={allowFiles} onChange={event=>setAllowFiles(event.target.checked)}/> Allow student file attachments</label><label><input type="checkbox" checked={studentReplies} onChange={event=>setStudentReplies(event.target.checked)}/> Allow student discussion replies</label><label>Due date <input type="date" value={assignmentDraft.due} onChange={e=>setAssignmentDraft({...assignmentDraft,due:e.target.value})}/></label><div className="classroom-create-actions"><button className="button button-secondary" type="button" onClick={()=>{setAssignmentCohort("");setEditingAssignment(null);}}>Cancel</button><button className="button button-primary" disabled={saving||assignmentDraft.title.trim().length<3||assignmentDraft.instructions.trim().length<10}>{saving?"Saving…":editingAssignment?"Save changes":"Publish assignment"}</button></div></form>}
    {loading ? <div className="classroom-react-loading" role="status"><LoaderCircle className="spinner" size={20}/> Loading your classrooms…</div> : <div className="classroom-assignment-grid">{filteredAssignments.map(a => { const cohort=cohorts.find(c=>c.id===a.classroom_id); const subs=(workspace.submissions||[]).filter(s=>s.assignment_id===a.id); const mine=subs.filter(s=>s.student_uid===uid); const coach=!!cohort?.coach; const attemptsLeft=Math.max(0,(a.attempt_limit||1)-mine.length); return <article className="classroom-assignment-card" key={a.id}><p className="workspace-meta">{cohortName(a.classroom_id)} · {a.kind.replaceAll("_", " ")}</p><span className="classroom-state" data-state={a.archived ? "archived" : a.status}>{a.archived ? "Archived" : a.status === "published" ? "Published" : "Draft"}</span><h3>{a.title}</h3><p>{a.instructions || "Open this activity to see what your teacher assigned."}</p>{Boolean(a.rubric?.length) && <details><summary>Assessment rubric</summary><dl>{a.rubric!.map(criterion => <div key={criterion.name}><dt>{criterion.name}</dt><dd>Up to {criterion.max} points</dd></div>)}</dl></details>}{a.attachments?.map(file=><button type="button" className="button button-secondary" key={file.path} onClick={()=>{void downloadAttachment(file,a.id).catch(cause=>setMessage(cause instanceof Error?cause.message:"Could not download attachment."));}}>Download {file.name}</button>)}<div className="classroom-assignment-meta"><span>{a.due_at ? `Due ${new Date(a.due_at).toLocaleDateString()}` : "No due date"}</span><span>{coach?`${subs.filter(s=>!s.graded_at).length} awaiting review`: `${attemptsLeft} attempts left`}</span></div>{coach ? <div className="classroom-review-list">{subs.map(sub=><ReviewSubmission key={sub.id} submission={sub} assignment={a} initialDraft={workspace.grade_drafts.find(draft=>draft.submission_id===sub.id)?.data} onSave={gradeSubmission} onDownload={file=>{void downloadAttachment(file,a.id,sub.id).catch(cause=>setMessage(cause instanceof Error?cause.message:"Could not download attachment."));}}/>)}{!subs.length&&<small>No submissions yet.</small>}<div className="classroom-coach-assignment-actions"><button className="button button-secondary" onClick={()=>{setEditingAssignment(a);setAssignmentCohort(a.classroom_id);setAssignmentKind(a.kind==="drill"?"drill":a.kind==="ai_debate"?"ai_debate":a.kind==="live_debate"?"live_debate":a.kind==="private_debate"?"private_debate":"position_paper");setAssignmentMode(a.activity_settings?.mode||"written");setAssignmentTurns(a.activity_settings?.turns||3);setDrillMode(a.activity_settings?.drill_mode||"fallacy");setDrillDifficulty(a.activity_settings?.difficulty||"all");setAssignmentSpeechSeconds(a.activity_settings?.speech_seconds||90);setAssignmentStatus(a.status==="draft"?"draft":"published");setAttemptLimit(a.attempt_limit||1);setMaxScore(a.max_score||10);setRubricDraft((a.rubric||[{name:"Reasoning and evidence",max:10}]).map(item=>`${item.name} | ${item.max}`).join("\n"));setAllowLate(a.allow_late||false);setStudentReplies(a.student_replies??true);setAllowFiles(a.allow_files||false);setAssignmentFile(null);setAssignmentDraft({title:a.title,instructions:a.instructions||"",due:a.due_at?.slice(0,10)||""});}}>Edit assignment</button><button className="button button-secondary" onClick={()=>{setEditingAssignment(null);setAssignmentCohort(a.classroom_id);setAssignmentKind(a.kind as "position_paper"|"drill"|"ai_debate"|"live_debate"|"private_debate");setAssignmentMode(a.activity_settings?.mode||"written");setAssignmentTurns(a.activity_settings?.turns||3);setAssignmentSpeechSeconds(a.activity_settings?.speech_seconds||90);setAssignmentStatus("draft");setAttemptLimit(a.attempt_limit||1);setMaxScore(a.max_score||10);setRubricDraft((a.rubric||[]).map(item=>`${item.name} | ${item.max}`).join(String.fromCharCode(10)));setAllowLate(a.allow_late||false);setAllowFiles(a.allow_files||false);setStudentReplies(a.student_replies??true);setAssignmentFile(null);setAssignmentDraft({title:`${a.title} (copy)`,instructions:a.instructions||"",due:a.due_at?.slice(0,10)||""});}}>Duplicate</button><button className="button button-secondary" onClick={async()=>{if(!window.confirm("Delete this assignment? The server only allows deletion when there are no submissions."))return;try{await command("assignment",{assignment:a.id,operation:"delete"});setMessage("Assignment deleted.");await load();}catch(cause){setMessage(cause instanceof Error?cause.message:"Could not delete assignment.");}}}>Delete</button><button className="button button-secondary" onClick={async()=>{try{await command("assignment",{assignment:a.id,operation:"archive"});setMessage(a.archived?"Assignment restored.":"Assignment archived.");await load();}catch(cause){setMessage(cause instanceof Error?cause.message:"Could not archive assignment.");}}}>{a.archived?"Restore":"Archive"}</button></div></div> : a.kind==="position_paper"&&attemptsLeft>0 ? <div className="classroom-submit-form"><textarea value={submissionDrafts[a.id]||""} onChange={e=>setSubmissionDrafts(current=>({...current,[a.id]:e.target.value}))} maxLength={30000} placeholder="Write your position paper response…"/>{draftStatus[a.id]&&<small role="status">{draftStatus[a.id]}</small>}{a.allow_files&&<label className="classroom-file-pick">Attachment (PDF, TXT, PNG, JPG · 5 MB)<input type="file" aria-describedby="classroom-attachment-disclosure" accept=".pdf,.txt,.png,.jpg,.jpeg" onChange={event=>setSubmissionFiles(current=>({...current,[a.id]:Array.from(event.target.files||[]).slice(0,5)}))}/></label>}<button className="button button-primary" disabled={submitting===a.id||(submissionDrafts[a.id]||"").trim().length<20} onClick={()=>void submitPositionPaper(a)}>{submitting===a.id?"Submitting…":"Submit response"}</button></div> : !coach && a.kind==="drill"&&attemptsLeft>0 ? <button className="button button-primary classroom-launch-drill" onClick={()=>onLaunchDrill(a)}>Start assigned drill <ArrowRight size={16}/></button> : !coach && a.kind==="ai_debate"&&attemptsLeft>0 ? <button className="button button-primary classroom-launch-drill" onClick={()=>onLaunchAiDebate(a)}>Start assigned AI debate <ArrowRight size={16}/></button> : !coach && (a.kind==="live_debate"||a.kind==="private_debate")&&attemptsLeft>0 ? <button className="button button-primary classroom-launch-drill" onClick={()=>onLaunchLiveDebate(a)}>Start assigned {a.kind==="private_debate"?"private":"live"} debate <ArrowRight size={16}/></button> : !coach && a.kind!=="position_paper" ? <p className="classroom-react-hint">This assignment uses {a.kind.replaceAll("_"," ")} practice. Open the matching activity flow to complete it.</p> : null}{!coach&&mine.map(sub=><details className="classroom-review" key={sub.id}><summary>Attempt {sub.attempt_no} · {sub.state}</summary><p className="classroom-review-content">{sub.content}</p>{sub.attachments?.map(file=><button className="button button-secondary" key={file.path} onClick={()=>{void downloadAttachment(file,a.id,sub.id).catch(cause=>setMessage(cause instanceof Error?cause.message:"Could not download attachment."));}}>Download {file.name}</button>)}{sub.graded_at&&<div className="classroom-published-grade"><strong>{sub.score}/{a.max_score}</strong><p>{sub.feedback}</p><dl>{(a.rubric || []).map(criterion => <div key={criterion.name}><dt>{criterion.name}</dt><dd>{sub.rubric_scores?.[criterion.name] ?? "Not assessed"} / {criterion.max}</dd></div>)}</dl></div>}</details>)}</article>; })}{!filteredAssignments.length && <div className="classroom-react-empty"><BookOpen size={22}/><strong>{visibleCohorts.length ? assignments.length ? "No work in this view." : "No assignments yet." : "Your classroom is ready when you are."}</strong><span>{visibleCohorts.length ? assignments.length ? "Choose another status to see more work." : "New work will appear here when it is assigned." : "Join a cohort or create a classroom."}</span></div>}</div>}
    </div>
    <div hidden={panel!=="announcements"}>{cohorts.length>0 && <section className="classroom-announcement-panel"><div className="classroom-react-section-title"><div><span className="eyebrow">COHORT UPDATES</span><h2>Announcements</h2></div>{cohorts.some(c=>c.coach&&!c.archived)&&<button className="button button-secondary" onClick={() => setAnnouncementCohort(activeCohort !== "all" && cohorts.some(c=>c.id===activeCohort&&c.coach) ? activeCohort : cohorts.find(c=>c.coach&&!c.archived)?.id || "")}>New announcement</button>}</div>{announcementCohort && <form className="classroom-create-form" onSubmit={publishAnnouncement}><span className="eyebrow">POST TO {cohortName(announcementCohort).toUpperCase()}</span><input required minLength={2} maxLength={120} value={announcementDraft.title} onChange={e=>setAnnouncementDraft(current=>({...current,title:e.target.value}))} placeholder="Announcement title"/><textarea required maxLength={8000} value={announcementDraft.body} onChange={e=>setAnnouncementDraft(current=>({...current,body:e.target.value}))} placeholder="Share an update with this cohort"/><div className="classroom-create-actions"><button type="button" className="button button-secondary" onClick={()=>setAnnouncementCohort("")}>Cancel</button><button className="button button-primary" disabled={saving||announcementDraft.body.trim().length===0}>Publish announcement</button></div></form>}{workspace.announcements.filter(item=>activeCohort==="all"||item.classroom_id===activeCohort).sort((a,b)=>Number(b.pinned)-Number(a.pinned)||b.updated_at.localeCompare(a.updated_at)).map(item=>{const cohort=cohorts.find(c=>c.id===item.classroom_id);const readAt=workspace.reads.find(read=>read.classroom_id===item.classroom_id)?.read_at||"";const unread=item.updated_at>readAt;return <article className="classroom-announcement-card" key={item.id}><div><span className="eyebrow">{item.pinned?"PINNED · ":""}{cohortName(item.classroom_id)} · {unread?"UNREAD":"READ"}</span><h3>{item.title}</h3><p>{item.body}</p><small>{new Date(item.updated_at).toLocaleString()}</small></div><div className="classroom-announcement-actions">{!cohort?.coach&&unread&&<button className="button button-secondary" onClick={()=>void markRead(item.classroom_id)}>Mark read</button>}{cohort?.coach&&<><button className="button button-secondary" onClick={()=>void togglePinned(item)}>{item.pinned?"Unpin":"Pin"}</button><button className="button button-secondary" onClick={()=>void deleteAnnouncement(item)}>Delete</button></>}</div></article>;})}{!workspace.announcements.length&&<p className="classroom-react-empty">There are no cohort announcements yet.</p>}</section>}
    </div>
    <div hidden={panel!=="discussion"}>
    {assignments.length>0&&<section className="classroom-discussion-panel"><div className="classroom-react-section-title"><div><h2>Assignment discussions</h2></div></div>{assignments.filter(a=>!a.archived).map(assignment=>{const cohort=cohorts.find(c=>c.id===assignment.classroom_id);const questions=workspace.questions.filter(q=>q.assignment_id===assignment.id).sort((a,b)=>a.created_at.localeCompare(b.created_at));return <article className="classroom-discussion-card" key={assignment.id}><h3>{assignment.title}</h3>{questions.map(question=><div className="classroom-question" key={question.id}><div><strong>{question.user_id===uid?"You":cohort?.coach?(workspace.members.find(member=>member.user_id===question.user_id&&member.classroom_id===assignment.classroom_id)?.display_name||"Cohort member"):"Cohort member"}</strong><small>{new Date(question.created_at).toLocaleString()}</small><p>{question.body}</p></div>{cohort?.coach&&<button className="button button-secondary" onClick={()=>void moderateQuestion(question)}>Remove</button>}</div>)}{(assignment.student_replies!==false||cohort?.coach)&&<PeerReview post={body=>postDiscussion(assignment,body)}/>}{(assignment.student_replies!==false||cohort?.coach)&&<form className="classroom-question-form" onSubmit={event=>void postQuestion(event,assignment)}><textarea maxLength={4000} value={questionDrafts[assignment.id]||""} onChange={event=>setQuestionDrafts(current=>({...current,[assignment.id]:event.target.value}))} aria-label={`Discussion post for ${assignment.title}`} placeholder="Ask a question or add to the discussion"/><button className="button button-secondary" disabled={questionBusy===assignment.id||!(questionDrafts[assignment.id]||"").trim()}>{questionBusy===assignment.id?"Posting…":"Post to discussion"}</button></form>}{assignment.student_replies===false&&!cohort?.coach&&<p className="classroom-react-hint">Discussion replies are closed for this assignment.</p>}</article>;})}</section>}
    </div>
    <div hidden={panel!=="people"}>
    {cohorts.length>0&&<section className="classroom-people-panel"><div className="classroom-react-section-title"><div><h2>Members and invitations</h2></div></div>{<form className="classroom-organization-form" onSubmit={createOrganization}><label>Create an organization<input required minLength={2} maxLength={120} value={organizationDraft} onChange={event=>setOrganizationDraft(event.target.value)} placeholder="Organization name"/></label><button className="button button-secondary" disabled={saving||organizationDraft.trim().length<2}>{saving?"Saving…":"Create organization"}</button></form>}{workspace.organizations.map(org=><article className="classroom-organization-row" key={org.id}><span><strong>{org.name}</strong><small>{org.archived?"Archived":"Active"} · {cohorts.filter(c=>c.organization_id===org.id).length} classrooms</small></span>{org.owner_uid===uid&&<button className="button button-secondary" onClick={async()=>{try{await command("organization",{organization:org.id,name:org.name,archived:!org.archived});setMessage(org.archived?"Organization restored.":"Organization archived.");await load();}catch(cause){setMessage(cause instanceof Error?cause.message:"Could not update organization.");}}}>{org.archived?"Restore":"Archive"}</button>}</article>)}{coachCohorts.length>0&&<><form className="classroom-invite-form" onSubmit={createInvite}><ChoiceField required label="Invite to" value={inviteCohort} options={[{ value: "", label: "Choose a classroom" }, ...coachCohorts.map(cohort => ({ value: cohort.id, label: cohort.name }))]} onChange={setInviteCohort} /><label>Email (optional)<input type="email" value={inviteDraft.email} onChange={event=>setInviteDraft(current=>({...current,email:event.target.value}))} placeholder="name@example.com"/></label><ChoiceField label="Role" value={inviteDraft.role} options={[{ value: "student", label: "Student" }, { value: "coach", label: "Coach" }]} onChange={role => setInviteDraft(current => ({ ...current, role }))} /><label>Expires<input type="date" required value={inviteDraft.expires} onChange={event=>setInviteDraft(current=>({...current,expires:event.target.value}))}/></label><button className="button button-primary" disabled={inviteBusy||!inviteCohort}>{inviteBusy?"Creating…":"Create invitation"}</button></form>{inviteLink&&<div className="classroom-invite-link"><span>New invite link</span><input readOnly value={inviteLink}/><button className="button button-secondary" onClick={()=>{void navigator.clipboard.writeText(inviteLink).then(()=>setMessage("Invitation link copied."),()=>setMessage("Could not copy automatically; select the link to copy it."));}}>Copy link</button></div>}</>}{(activeCohort==="all"?cohorts:visibleCohorts).map(cohort=>{const members=workspace.members.filter(member=>member.classroom_id===cohort.id);const invites=workspace.invites.filter(invite=>invite.classroom_id===cohort.id);return <article className="classroom-people-cohort" key={cohort.id}><div className="classroom-people-cohort-head"><div><h3>{cohort.name}</h3><small>{cohort.organization_name||"Independent classroom"} · {cohort.archived?"Archived":"Active"}</small></div>{cohort.coach?<span><button className="button button-secondary" onClick={()=>void archiveCohort(cohort)}>{cohort.archived?"Restore":"Archive"}</button>{cohort.owner_uid===uid&&<button className="button button-secondary" onClick={()=>void deleteEmptyCohort(cohort)}>Delete empty classroom</button>}</span>:<button className="button button-secondary" onClick={()=>void leaveCohort(cohort)}>Leave classroom</button>}</div><div className="classroom-member-list">{members.map(member=><div className="classroom-member-row" key={member.user_id}><span><strong>{member.display_name}</strong><small>{member.role} · Joined {new Date(member.joined_at).toLocaleDateString()}</small></span>{cohort.coach&&member.user_id!==cohort.owner_uid&&<span className="classroom-member-actions"><button className="button button-secondary" onClick={()=>void changeMemberRole(member,member.role==="coach"?"student":"coach")}>{member.role==="coach"?"Make student":"Make coach"}</button><button className="button button-secondary" onClick={()=>void changeMemberRole(member,"remove")}>Remove</button></span>}</div>)}</div>{cohort.coach&&<div className="classroom-invite-list">{invites.map(invite=><div className="classroom-member-row" key={invite.id}><span><strong>{invite.invited_email||"Shareable link"}</strong><small>{invite.role} · {invite.revoked_at?"Revoked":invite.accepted_uid?"Accepted":new Date(invite.expires_at)<new Date()?"Expired":"Pending"} · Expires {new Date(invite.expires_at).toLocaleDateString()}</small></span>{!invite.accepted_uid&&!invite.revoked_at&&new Date(invite.expires_at)>new Date()&&<button className="button button-secondary" onClick={()=>void revokeInvite(invite)}>Revoke</button>}</div>)}{!invites.length&&<small>No invitations yet.</small>}</div>}</article>;})}</section>}
    </div>
    <div hidden={panel!=="progress"}>
    {coachCohorts.length>0&&reportAssignments.length>0&&<section className="classroom-progress-panel"><div className="classroom-react-section-title"><div><span className="eyebrow">CLASSROOM ANALYTICS</span><h2>Progress</h2></div><small>{reportAssignments.length} published assignment{reportAssignments.length===1?"":"s"}</small></div><div className="classroom-progress-stats"><article><small>STUDENTS</small><strong>{reportRows.length}</strong></article><article><small>SUBMISSIONS</small><strong>{reportSubmissions.length}</strong></article><article><small>AWAITING REVIEW</small><strong>{reportSubmissions.filter(sub=>!sub.graded_at).length}</strong></article><article><small>AVERAGE SCORE</small><strong>{averageScore===null?"—":`${averageScore}%`}</strong></article></div><button className="workspace-secondary" onClick={() => downloadFile("veritas-classroom-progress.csv", [
      ["Student", "Completed", "Eligible assignments", "Completion percent", "Attempts", "On-time submissions"],
      ...reportRows.map(row => [row.name, row.complete, row.eligible, row.rate, row.attempts, row.onTime]),
    ].map(row => row.map(csvCell).join(",")).join("\r\n"), "text/csv")}>Export progress CSV</button><h3>Participation and completion</h3>{reportRows.length>0?<div className="classroom-report-table" tabIndex={0} role="region" aria-label="Student progress table"><table><thead><tr><th>Student</th><th>Completed</th><th>Rate</th><th>Attempts</th><th>On time</th></tr></thead><tbody>{reportRows.map(row=><tr key={row.name}><td>{row.name}</td><td>{row.complete}/{row.eligible}</td><td>{row.rate}%</td><td>{row.attempts}</td><td>{row.onTime}</td></tr>)}</tbody></table></div>:<p className="classroom-react-hint">Student participation will appear here as members submit work.</p>}<h3>Assigned drill assessments</h3>{drillSubmissions.length>0?<div className="classroom-report-table" tabIndex={0} role="region" aria-label="Student progress table"><table><thead><tr><th>Student</th><th>Drill</th><th>Difficulty</th><th>Accuracy</th><th>Submitted</th></tr></thead><tbody>{drillSubmissions.map(sub=><tr key={sub.id}><td>{reportStudents.find(member=>member.user_id===sub.student_uid)?.display_name||"Member"}</td><td>{String(sub.activity?.modeKey||"Practice").replaceAll("_"," ")}</td><td>{sub.activity?.difficulty||"Mixed"}</td><td>{sub.activity?.correct??0}/{sub.activity?.total??0} ({sub.activity?.accuracy??0}%)</td><td>{new Date(sub.submitted_at).toLocaleDateString()}</td></tr>)}</tbody></table></div>:<p className="classroom-react-hint">Completed assigned drill results will appear here.</p>}<h3>Assignment performance</h3><div className="classroom-report-table" tabIndex={0} role="region" aria-label="Student progress table"><table><thead><tr><th>Assignment</th><th>Submissions</th><th>Average score</th></tr></thead><tbody>{reportAssignments.map(assignment=>{const graded=reportSubmissions.filter(sub=>sub.assignment_id===assignment.id&&typeof sub.score==="number");const average=graded.length?(graded.reduce((sum,sub)=>sum+(sub.score||0),0)/graded.length).toFixed(1):"—";return <tr key={assignment.id}><td>{assignment.title}</td><td>{reportSubmissions.filter(sub=>sub.assignment_id===assignment.id).length}</td><td>{average}{average!=="—"?` / ${assignment.max_score||10}`:""}</td></tr>;})}</tbody></table></div>{gradedSubmissions.length>0&&<><h3>Recent feedback</h3>{gradedSubmissions.slice().sort((a,b)=>(b.graded_at||"").localeCompare(a.graded_at||"")).slice(0,5).map(sub=><article className="classroom-recent-feedback" key={sub.id}><strong>{reportStudents.find(member=>member.user_id===sub.student_uid)?.display_name||"Member"} · {reportAssignments.find(a=>a.id===sub.assignment_id)?.title}</strong><p>{sub.feedback||"No written feedback."}</p></article>)}</>}</section>}
    {!reportAssignments.length&&<p className="workspace-note">Reports appear after published assignments are available.</p>}
    </div>
  </section>;
}
