import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readStudyStore } from '../src/lib/study-storage.ts';
const storage = entries => ({getItem:key=>entries[key] ?? null});
test('legacy unowned Study notes stay with guests and never migrate into a signed-in account', () => {
  const old = storage({'veritas-react-study-notes':JSON.stringify([{title:'Private legacy note',type:'frame',excerpt:'An unfinished idea.'}])});
  assert.equal(readStudyStore(old,'guest').bookmarks.length,1);
  assert.equal(readStudyStore(old,'account-a').bookmarks.length,0);
  assert.equal(readStudyStore(old,'account-b').bookmarks.length,0);
});
test('account Study storage stays isolated and malformed collections cannot break the screen', () => {
  const saved = storage({'veritas_study_v1:account-a':JSON.stringify({target:5,sessions:[null,{lessonId:'x',at:'2026-11-24',week:'2026-11-23'}],bookmarks:'bad',lessons:[],reminderSeenWeeks:[null,'2026-11-23']})});
  const own = readStudyStore(saved,'account-a');
  assert.equal(own.target,5); assert.equal(own.sessions.length,1); assert.deepEqual(own.bookmarks,[]); assert.deepEqual(own.lessons,{});
  assert.equal(readStudyStore(saved,'account-b').sessions.length,0);
});
