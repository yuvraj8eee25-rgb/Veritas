import { describe, expect, it } from "vitest";
import { clearGradeRequest, gradeRequest } from "../../src/features/grade-request.js";

function storageStub() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

describe("Classroom grading retry keys", () => {
  it("reuses the key for a retry and rotates it after the saved version changes", () => {
    const storage = storageStub();
    let next = 0;
    const cryptoApi = { randomUUID: () => `request-${++next}` };
    const first = gradeRequest(storage, "submission-1", 4, cryptoApi);
    expect(gradeRequest(storage, "submission-1", 4, cryptoApi)).toEqual(first);
    expect(gradeRequest(storage, "submission-1", 5, cryptoApi).requestId).not.toBe(first.requestId);
    clearGradeRequest(storage, first.key);
    expect(storage.getItem(first.key)).toBeNull();
  });
});
