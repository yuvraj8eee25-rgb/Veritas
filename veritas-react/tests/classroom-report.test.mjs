import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eligibleAssignments, normalizedAverage } from '../src/lib/classroom-report.ts';

const assignments = [{ id: 'a', classroom_id: 'one', max_score: 5 }, { id: 'b', classroom_id: 'two', max_score: 20 }];
test('completion only includes classrooms the student attends, including multiple memberships', () => {
  const members = [{ user_id: 'u', classroom_id: 'one', display_name: 'Student' }];
  assert.deepEqual(eligibleAssignments(assignments, members, 'u').map(a => a.id), ['a']);
  assert.deepEqual(eligibleAssignments(assignments, members, 'other'), []);
  assert.equal(eligibleAssignments(assignments, [...members, { ...members[0], classroom_id: 'two' }], 'u').length, 2);
});
test('mixed score scales normalize, ungraded and zero-denominator scores do not contribute', () => {
  assert.equal(normalizedAverage(assignments, [
    { assignment_id: 'a', student_uid: 'u', score: 5, graded_at: '2026-11-24' },
    { assignment_id: 'b', student_uid: 'u', score: 5, graded_at: '2026-11-24' },
    { assignment_id: 'b', student_uid: 'v', score: 20 },
  ]), 63);
  assert.equal(normalizedAverage([{ ...assignments[0], max_score: 0 }], [{ assignment_id: 'a', student_uid: 'u', score: 5, graded_at: 'today' }]), null);
});
