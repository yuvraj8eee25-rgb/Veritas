export const peerReviewPrompts = [
  ["claim", "Claim or point being reviewed"], ["strength", "Strongest part of the argument"],
  ["evidence", "Evidence: what it supports and what it cannot show"],
  ["question", "A constructive question or objection"], ["revision", "One specific revision to try"],
] as const;
export type PeerReviewDraft = Record<typeof peerReviewPrompts[number][0], string>;
export function peerReviewText(draft: PeerReviewDraft) {
  for (const [key] of peerReviewPrompts) if (typeof draft[key] !== "string" || draft[key].trim().length < 5 || draft[key].length > 600) throw new Error("Complete each review section using 5–600 characters.");
  return `STRUCTURED PEER REVIEW\n\n${peerReviewPrompts.map(([key, label]) => `${label}\n${draft[key].trim()}`).join("\n\n")}`;
}
export function discussionRequestId(storage: Pick<Storage, "getItem" | "setItem">, owner: string, assignment: string, body: string, newId: () => string) {
  const key = `veritas:discussion-request:${owner}:${assignment}`;
  let pending: { id: string; body: string }[] = [];
  try {
    const previous = JSON.parse(storage.getItem(key) ?? "[]");
    const rows = Array.isArray(previous) ? previous : [previous];
    pending = rows.filter(item => typeof item?.id === "string" && typeof item?.body === "string");
  } catch { /* Replace malformed drafts. */ }
  const prior = pending.find(item => item.body === body);
  if (prior) return { key, id: prior.id };
  if (pending.length >= 20) throw new Error("Retry your pending discussion posts before starting more posts for this assignment.");
  const id = newId(); storage.setItem(key, JSON.stringify([...pending, { id, body }]));
  return { key, id };
}
export function completeDiscussionRequest(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, key: string, id: string) {
  const current = JSON.parse(storage.getItem(key) ?? "[]");
  const remaining = (Array.isArray(current) ? current : [current]).filter(item => item?.id !== id);
  if (remaining.length) storage.setItem(key, JSON.stringify(remaining)); else storage.removeItem(key);
}
