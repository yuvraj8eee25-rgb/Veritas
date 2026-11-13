export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateDebateReply(value) {
  return isRecord(value) && value.ok === true && typeof value.text === "string" && value.text.length > 0 && value.text.length <= 6000;
}

export function validateRefereeResult(value) {
  const v = value?.verdict;
  return value?.ok === true && isRecord(v)
    && Number.isFinite(v.debaterScore) && v.debaterScore >= 0 && v.debaterScore <= 100
    && Number.isFinite(v.aiScore) && v.aiScore >= 0 && v.aiScore <= 100
    && typeof v.winner === "string" && typeof v.summary === "string"
    && Array.isArray(v.turnFeedback);
}

export function validateDrillResult(value) {
  return value?.ok === true && Number.isFinite(value.score) && value.score >= 0 && value.score <= 100
    && typeof value.feedback === "string" && value.feedback.length <= 6000;
}

export function validateEvidenceResult(action, value) {
  if (!isRecord(value) || value.ok !== true) return false;
  if (action === "classify") return Array.isArray(value.assessments) && value.assessments.length <= 30 && value.assessments.every(item => isRecord(item) && typeof item.id === "number" && ["supports", "contradicts", "neutral"].includes(item.stance) && ["strong", "moderate", "weak"].includes(item.strength) && typeof item.finding === "string");
  if (action === "plan_queries") return Array.isArray(value.queries) && value.queries.length <= 8 && value.queries.every(item => typeof item === "string" && item.length <= 300);
  if (action === "summarize") return typeof value.summary === "string" && value.summary.length >= 20 && value.summary.length <= 6000;
  return false;
}

export function validateEvidenceAssessment(value) {
  if (!isRecord(value)) return false;
  const points = value.points ?? value.arguments;
  if (!Array.isArray(points) || points.length > 30) return false;
  if (points.some(point => !isRecord(point) || typeof (point.text ?? point.claim) !== "string" || (point.text ?? point.claim).length > 2000)) return false;
  return true;
}

export function resultSource(data) {
  if (data?.estimated === true || data?.provider === "Knowledge Base Fallback" || data?.provider === "Demo scenario") return "estimate";
  return data?.provider ? "ai" : "unknown";
}
