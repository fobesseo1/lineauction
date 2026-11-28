import test from 'node:test';
import assert from 'node:assert/strict';
import {stepProblem,dayProblems,asksAboutFactory} from './step-check.mjs';

test('a step that exited 0 can still be a problem',()=>{
 assert.equal(stepProblem({name:'molit',code:0,result:'DONE loaded 0 region-months now; warehouse 4990067 trades (stopped: CONSECUTIVE_ERRORS:API_04)'}),'성공으로 끝났지만 중간에 멈춤: CONSECUTIVE_ERRORS:API_04');
 assert.equal(stepProblem({name:'molit',code:0,result:'DONE loaded 0 region-months now; warehouse 1 trades'}),'국토부 실거래를 하나도 받지 못함');
 assert.equal(stepProblem({name:'molit',code:0,result:'DONE loaded 2560 region-months now'}),null);
 assert.match(stepProblem({name:'onbid-lifecycle',code:1,result:'Error: LARGE_DELETE_BLOCKED 처음 목록에서 빠진 입찰 조건 625/3865'}),/^안전장치에 걸려 멈춤/);
 assert.equal(stepProblem({name:'schools',code:1,timedOut:true,result:''}),'시간 초과');
});

// The 2026-11-27/28 case: the run said "completed" while onbid-lifecycle had failed.
const runs=[
 {job:'onbid',day:'2026-11-27',startedAt:'2026-11-26T23:46:28.827Z',status:'completed',steps:[{name:'onbid-list',code:0},{name:'onbid-lifecycle',code:1,result:'Error: LARGE_DELETE_BLOCKED x'}]},
 {job:'onbid',day:'2026-11-27',status:'skipped'},
 {job:'onbid',day:'2026-11-28',startedAt:'2026-11-27T23:31:50.735Z',status:'completed',steps:[{name:'onbid-lifecycle',code:1,result:'Error: LARGE_DELETE_BLOCKED y'}]},
];
test('a completed run with a failed step is reported',()=>{
 assert.deepEqual(dayProblems(runs,[],'2026-11-27').map(p=>[p.job,p.step]),[['onbid','onbid-lifecycle']]);
});
test('a later successful rerun clears it, but only for its own day',()=>{
 const reruns=[{job:'onbid',step:'onbid-lifecycle',ok:true,at:'2026-11-27T23:58:32.467Z',day:'2026-11-28'}];
 assert.deepEqual(dayProblems(runs,reruns,'2026-11-28'),[]);
 assert.equal(dayProblems(runs,reruns,'2026-11-27').length,1);
 assert.equal(dayProblems(runs,[{...reruns[0],ok:false}],'2026-11-28').length,1);
});
test('the hook speaks up on factory questions only',()=>{
 for(const p of ['오늘 공장 잘돌고 있음.?','현재 상황은?','완료됐는데 문제 없지.?'])assert.ok(asksAboutFactory(p),p);
 assert.ok(!asksAboutFactory('한국어로 얘기해.!'));
});
