import assert from 'node:assert/strict';
import { test } from 'node:test';
import { descendants, mapAsText, moveArgumentPoint, readArgumentMap, readArgumentMaps, removeArgumentPoint } from '../src/lib/argument-map.ts';
const point = (id, parentId, kind = 'reason') => ({ id, parentId, kind, text: `Point ${id}`, card: null });
const map = () => ({ id: 'map', title: 'A defensible argument', updatedAt: '2026-11-24T00:00:00Z', points: [point('root', null, 'claim'), point('reason', 'root'), point('objection', 'reason', 'objection'), point('reply', 'objection', 'reply')] });
test('maps reject cycles, missing parents, duplicate IDs and excessive nesting', () => {
  assert.ok(readArgumentMap(map()));
  const cycle = map(); cycle.points[1].parentId = 'reply'; assert.equal(readArgumentMap(cycle), null);
  const orphan = map(); orphan.points[1].parentId = 'missing'; assert.equal(readArgumentMap(orphan), null);
  const duplicate = map(); duplicate.points.push(duplicate.points[1]); assert.equal(readArgumentMap(duplicate), null);
  const deep = map(); deep.points = Array.from({ length: 9 }, (_, i) => point(`n${i}`, i ? `n${i-1}` : null, i ? 'reason' : 'claim')); assert.equal(readArgumentMap(deep), null);
  assert.deepEqual(readArgumentMaps('not-json'), []);
});
test('moving and removing a branch preserves other points and never strands its children', () => {
  assert.throws(() => moveArgumentPoint(map(), 'reason', 'reply'), /outside/);
  assert.throws(() => moveArgumentPoint(map(), 'root', 'reason'));
  assert.deepEqual([...descendants(map(), 'reason')], ['reason', 'objection', 'reply']);
  assert.deepEqual(removeArgumentPoint(map(), 'reason').points.map(p => p.id), ['root']);
  const moved = moveArgumentPoint(map(), 'reply', 'root');
  assert.equal(moved.points.find(p => p.id === 'reply').parentId, 'root');
  assert.equal(map().points.find(p => p.id === 'reply').parentId, 'objection');
  assert.match(mapAsText(moved), /REPLY: Point reply/);
});
