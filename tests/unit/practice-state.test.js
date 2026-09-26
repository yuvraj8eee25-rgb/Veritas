import { describe, expect, it } from "vitest";
import { defaultState, loadProgress, normalizeProgress, saveProgress, STORAGE_KEY } from "../../src/features/practice-state.js";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map };
}

describe("local practice progress", () => {
  it("keeps historical progress and fills fields introduced later", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ totalXp: 120, skills: { logic: 7 }, achievements: ["first-win"] }) });
    const state = loadProgress(storage);
    expect(state.totalXp).toBe(120);
    expect(state.skills).toEqual({ ...defaultState().skills, logic: 7 });
    expect(state.achievements).toEqual(["first-win"]);
  });
  it("recovers from malformed and incompatible saved data", () => {
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: "{" }))).toEqual(defaultState());
    expect(normalizeProgress({ skills: null, achievements: "bad", activity: [] })).toEqual(defaultState());
  });
  it("saves progress under the unchanged storage key", () => {
    const storage = memoryStorage();
    expect(saveProgress({ totalXp: 30 }, storage)).toBe(true);
    expect(JSON.parse(storage.map.get(STORAGE_KEY)).totalXp).toBe(30);
  });
});
