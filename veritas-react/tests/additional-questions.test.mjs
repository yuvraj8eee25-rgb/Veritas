import { test } from 'node:test';
import assert from 'node:assert/strict';
import { additionalQuestions } from '../src/features/additional-questions.ts';
test('new transfer questions have unique IDs, valid answers and instructional feedback', () => {
  const questions = Object.values(additionalQuestions).flat();
  assert.equal(questions.length, 24);
  assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
  assert.equal(new Set(questions.map(q => q.prompt)).size, questions.length);
  for (const q of questions) {
    assert.ok(['easy', 'medium', 'hard'].includes(q.difficulty));
    assert.ok(q.correct >= 0 && q.correct < q.options.length);
    assert.ok(q.explain.length > 40);
    assert.equal(new Set(q.options).size, q.options.length);
  }
});
