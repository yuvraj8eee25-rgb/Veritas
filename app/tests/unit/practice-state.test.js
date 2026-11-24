import { describe, expect, it } from "vitest";
import { defaultState, loadProgress, normalizeProgress, saveProgress, STORAGE_KEY } from "../../src/features/practice-state.js";

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map };
}

describe("local practice progress", () => {
  it("keeps historical rewards and separates legacy skill points", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ totalXp: 120, skills: { logic: 7 }, achievements: ["first-win"] }) });
    const state = loadProgress(storage);
    expect(state.totalXp).toBe(120);
    expect(state.skills).toEqual(defaultState().skills);
    expect(state.legacySkills).toEqual({ logic: 7 });
    expect(state.achievements).toEqual(["first-win"]);
  });
  it("recovers from malformed and incompatible saved data", () => {
    expect(loadProgress(memoryStorage({ [STORAGE_KEY]: "{" }))).toEqual(defaultState());
    expect(normalizeProgress({ skills: null, achievements: "bad", activity: [] })).toEqual(defaultState());
  });
  it("saves guest progress without overwriting another account", () => {
    const storage = memoryStorage();
    expect(saveProgress({ totalXp: 30 }, storage)).toBe(true);
    expect(loadProgress(storage, "guest").totalXp).toBe(30);
    expect(loadProgress(storage, "account-a").totalXp).toBe(0);
    saveProgress({ totalXp: 80 }, storage, "account-a");
    expect(loadProgress(storage, "account-a").totalXp).toBe(80);
    expect(loadProgress(storage, "guest").totalXp).toBe(30);
    expect(loadProgress(storage, "account-b").totalXp).toBe(0);
  });
  it("does not attach ambiguous historical progress to a signed-in account", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: JSON.stringify({ totalXp: 500 }) });
    expect(loadProgress(storage, "account-a").totalXp).toBe(0);
    expect(loadProgress(storage, "guest").totalXp).toBe(500);
  });
});
