import { describe, expect, it } from "vitest";
import { collisionSafePath, validateAttachment } from "../../src/features/attachment-validation.js";
import { resultSource, validateDebateReply, validateDrillResult, validateEvidenceResult, validateRefereeResult } from "../../src/features/ai-contracts.js";

describe("attachment boundaries", () => {
  it("accepts supported files only within the private bucket size cap", () => {
    expect(validateAttachment({ name: "work.pdf", type: "application/pdf", size: 100 })).toEqual({ ok: true });
    expect(validateAttachment({ type: "image/svg+xml", size: 100 }).ok).toBe(false);
    expect(validateAttachment({ type: "text/plain", size: 5 * 1024 * 1024 + 1 }).ok).toBe(false);
    expect(validateAttachment({ type: "text/plain", size: 0 }).ok).toBe(false);
  });
  it("builds per-request unique paths and rejects unsafe path components", () => {
    expect(collisionSafePath("user-1", "assign-1", "req-1", "uuid-1")).toBe("user-1/assign-1/req-1/uuid-1");
    expect(() => collisionSafePath("../user", "assign", "req", "uuid")).toThrow();
  });
});

describe("AI response contracts", () => {
  it("rejects malformed model responses before UI rendering", () => {
    expect(validateDebateReply({ ok: true, text: "A supported response" })).toBe(true);
    expect(validateDebateReply({ ok: true, text: 12 })).toBe(false);
    expect(validateRefereeResult({ ok: true, verdict: { debaterScore: 50, aiScore: 40, winner: "you", summary: "Good debate", turnFeedback: [] } })).toBe(true);
    expect(validateRefereeResult({ ok: true, verdict: { debaterScore: 140 } })).toBe(false);
    expect(validateDrillResult({ ok: true, score: 70, feedback: "Clear point" })).toBe(true);
    expect(validateDrillResult({ ok: true, score: "70", feedback: "Clear point" })).toBe(false);
    expect(validateEvidenceResult("classify", { ok: true, assessments: [{ id: 1, stance: "supports", strength: "strong", finding: "Evidence" }] })).toBe(true);
    expect(validateEvidenceResult("classify", { ok: true, assessments: ["not an object"] })).toBe(false);
    expect(validateEvidenceResult("summarize", { ok: true, summary: "A sufficiently long summary of the evidence and its limitations." })).toBe(true);
  });
  it("labels fallback output as an estimate", () => {
    expect(resultSource({ provider: "Knowledge Base Fallback" })).toBe("estimate");
    expect(resultSource({ estimated: true })).toBe("estimate");
    expect(resultSource({ provider: "Gemini" })).toBe("ai");
  });
});
