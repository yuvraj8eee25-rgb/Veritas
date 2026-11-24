import assert from 'node:assert/strict';
import {test} from 'node:test';
import {classroomTaskState} from '../src/lib/classroom-task.ts';
test('learner queues use the latest own attempt and distinguish feedback from revision requests',()=>{
 const a={id:'a',status:'published'}; const subs=[{assignment_id:'a',student_uid:'other',attempt_no:1,state:'graded',graded_at:'today'}];
 assert.equal(classroomTaskState(a,subs,false,'u'),'todo');
 subs.push({assignment_id:'a',student_uid:'u',attempt_no:1,state:'graded',graded_at:'yesterday'});
 assert.equal(classroomTaskState(a,subs,false,'u'),'feedback');
 subs.push({assignment_id:'a',student_uid:'u',attempt_no:2,state:'resubmission-requested'});
 assert.equal(classroomTaskState(a,subs,false,'u'),'todo');
});
test('teacher review queues include submitted work but not a returned revision request or draft assignment',()=>{
 const a={id:'a',status:'published'}; const subs=[{assignment_id:'a',student_uid:'u',attempt_no:1,state:'resubmission-requested'}];
 assert.equal(classroomTaskState(a,subs,true,'coach'),'published');
 subs.push({assignment_id:'a',student_uid:'v',attempt_no:1,state:'late'});
 assert.equal(classroomTaskState(a,subs,true,'coach'),'review');
 assert.equal(classroomTaskState({...a,status:'draft'},subs,true,'coach'),'drafts');
});
