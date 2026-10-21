import { describe, it, expect } from 'vitest';
import { recordAssessment, masteryScores, prioritizeAssessment } from '../../src/features/mastery.js';
import { normalizeProgress } from '../../src/features/practice-state.js';
const now = Date.parse('2026-10-02T00:00:00Z');
const day = 86400000;
const checks = (difficulty, correct = true) => Array.from({ length: 4 }, (_, i) => ({ id: `${difficulty}-${i}`, difficulty, correct }));
describe('drill mastery separates learning evidence from participation', () => {
  it('does not add mastery for an entirely incorrect run', () => {
    const result = recordAssessment({}, 'logic', checks('easy', false), now);
    expect(result.scores.logic).toBe(0);
    expect(result.assessed).toBe(4);
  });
  it('repeating easy questions cannot reach advanced mastery', () => {
    let records = {};
    for (let i = 0; i < 100; i++) records = recordAssessment(records, 'logic', checks('easy'), now + i * 1000).records;
    expect(masteryScores(records, now + day).logic).toBe(25);
    expect(Object.keys(records)).toHaveLength(4);
  });
  it('ignores immediate retries but lowers an estimate after a failed delayed review', () => {
    const initial = recordAssessment({}, 'logic', checks('hard'), now);
    const retry = recordAssessment(initial.records, 'logic', checks('hard', false), now + day);
    expect(retry.assessed).toBe(0);
    expect(retry.scores.logic).toBe(40);
    const review = recordAssessment(initial.records, 'logic', checks('hard', false), now + 7 * day);
    expect(review.scores.logic).toBe(0);
  });
  it('requires coverage at each difficulty and discounts old evidence', () => {
    const result = recordAssessment({}, 'logic', [...checks('easy'), ...checks('medium'), ...checks('hard')], now);
    expect(result.scores.logic).toBe(100);
    expect(masteryScores(result.records, now + 90 * day).logic).toBe(50);
    expect(recordAssessment({}, 'logic', checks('easy').slice(0, 1), now).scores.logic).toBe(6);
  });
  it('preserves historical XP without relabeling old participation points as mastery', () => {
    const saved = normalizeProgress({ totalXp: 3000, totalRuns: 20, skills: { logic: 100 } });
    expect(saved.totalXp).toBe(3000); expect(saved.totalRuns).toBe(20);
    expect(saved.legacySkills.logic).toBe(100); expect(saved.skills.logic).toBe(0);
  });
  it('prioritizes unseen questions, then due reviews, before immediate repetitions', () => {
    const pool = [{ id: 'recent' }, { id: 'due' }, { id: 'fresh' }];
    const records = { 'logic:recent': { at: now }, 'logic:due': { at: now - 8 * day } };
    expect(prioritizeAssessment(pool, 'logic', records, now).map(q => q.id)).toEqual(['fresh', 'due', 'recent']);
  });
});
