export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "application/pdf", "text/plain", "image/png", "image/jpeg"
]);

export function validateAttachment(file) {
  if (!file || typeof file.size !== "number") return { ok: false, message: "Choose a file to attach." };
  if (file.size < 1) return { ok: false, message: "The selected file is empty." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, message: "Attachments are limited to 5 MB." };
  if (!ALLOWED_ATTACHMENT_TYPES.has(file.type)) return { ok: false, message: "Attachments must be PDF, TXT, PNG, or JPG files." };
  return { ok: true };
}

export function collisionSafePath(userId, assignmentId, requestId, randomId) {
  for (const value of [userId, assignmentId, requestId, randomId]) {
    if (typeof value !== "string" || !/^[a-zA-Z0-9-]{1,80}$/.test(value)) throw new TypeError("Invalid attachment path component.");
  }
  return `${userId}/${assignmentId}/${requestId}/${randomId}`;
}
