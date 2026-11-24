import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classroomAnswers } from '../src/lib/classroom-answers.ts';
test('shuffled options submit canonical answers and preserve timeouts', () => {
  const original = [{ id: 'q', options: ['A', 'B', 'C'] }];
  const presented = [{ id: 'q', options: ['C', 'A', 'B'] }];
  assert.deepEqual(classroomAnswers('fallacy', [{ id: 'q', answer: 0 }], presented, original), [{ id: 'q', answer: 2, timedOut: false }]);
  assert.deepEqual(classroomAnswers('fallacy', [{ id: 'q', answer: -1 }], presented, original), [{ id: 'q', answer: null, timedOut: true }]);
  assert.throws(() => classroomAnswers('fallacy', [{ id: 'unknown', answer: 0 }], presented, original));
});
test('true/false submissions preserve booleans even when their display order changes', () => {
  const original = [{ id: 'q', options: ['True', 'False'] }];
  const presented = [{ id: 'q', options: ['False', 'True'] }];
  assert.equal(classroomAnswers('speed', [{ id: 'q', answer: 0 }], presented, original)[0].answer, false);
  assert.equal(classroomAnswers('speed', [{ id: 'q', answer: 1 }], presented, original)[0].answer, true);
});
