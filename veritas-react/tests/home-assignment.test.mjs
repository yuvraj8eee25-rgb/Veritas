import assert from 'node:assert/strict';
import {test} from 'node:test';
import {nextClassroomTask} from '../src/lib/home-assignment.ts';
const assignment = (id,cid,due) => ({id,classroom_id:cid,title:id,status:'published',archived:false,due_at:due});
test('home prioritizes pending learner work and never teacher-only or unpublished assignments',()=>{
 const data={cohorts:[{id:'learn',coach:false},{id:'teach',coach:true}],assignments:[assignment('teacher','teach','2026-01-01'),assignment('later','learn','2026-12-01'),assignment('sooner','learn','2026-11-25'),{...assignment('draft','learn','2026-01-01'),status:'draft'}],submissions:[]};
 assert.equal(nextClassroomTask(data,'u').id,'sooner');
 data.submissions.push({assignment_id:'sooner',student_uid:'u',attempt_no:1,state:'graded',graded_at:'2026-11-24'});
 assert.equal(nextClassroomTask(data,'u').id,'later');
 data.submissions.push({assignment_id:'later',student_uid:'u',attempt_no:1,state:'submitted'});
 assert.equal(nextClassroomTask(data,'u').feedback,true);
});
test('a resubmission uses the latest own attempt; another learner cannot complete your work',()=>{
 const data={cohorts:[{id:'c',coach:false}],assignments:[assignment('work','c',null)],submissions:[{assignment_id:'work',student_uid:'other',attempt_no:3,state:'graded',graded_at:'2026-11-24'}]};
 assert.equal(nextClassroomTask(data,'u').feedback,false);
 data.submissions.push({assignment_id:'work',student_uid:'u',attempt_no:1,state:'graded',graded_at:'2026-11-23'},{assignment_id:'work',student_uid:'u',attempt_no:2,state:'resubmission-requested'});
 assert.equal(nextClassroomTask(data,'u').resubmission,true);
});
