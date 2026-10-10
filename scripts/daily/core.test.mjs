import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduledSkip,lockState,koreanDay,onbidMessage} from './core.mjs';

test('scheduled run skips after a manual run the same KST day and reports it',()=>{
 const runs=[{job:'onbid',trigger:'manual',day:'2026-10-11',status:'completed',finishedAt:'2026-10-11T00:30:00Z'}];
 assert.deepEqual(scheduledSkip(runs,'onbid','2026-10-11'),{skip:true,reason:'manual-today',at:'2026-10-11T00:30:00Z'});
 assert.equal(scheduledSkip(runs,'court','2026-10-11').skip,false);
 assert.equal(scheduledSkip(runs,'onbid','2026-10-12').skip,false);
});
test('failed or skipped runs do not suppress the scheduled run; a finished scheduled run does',()=>{
 assert.equal(scheduledSkip([{job:'onbid',trigger:'manual',day:'d',status:'failed'}],'onbid','d').skip,false);
 assert.equal(scheduledSkip([{job:'onbid',trigger:'schedule',day:'d',status:'skipped'}],'onbid','d').skip,false);
 assert.deepEqual(scheduledSkip([{job:'onbid',trigger:'schedule',day:'d',status:'completed'}],'onbid','d'),{skip:true,reason:'scheduled-today'});
});
test('lock is busy only while its process is alive',()=>{
 assert.equal(lockState(null,()=>true),'free');
 assert.equal(lockState({pid:1},()=>true),'busy');
 assert.equal(lockState({pid:1},()=>false),'stale');
});
test('Korean day boundary and summary text',()=>{
 assert.equal(koreanDay(new Date('2026-10-10T15:30:00Z')),'2026-10-11');
 assert.match(onbidMessage({list:{properties:8907,conditions:26949,refresh:true,added:12,removed:3},detail:{processed:1999,total:8916,remaining:6917},usage:{list:276,detail:1000}}),/신규 12 · 종료 3[\s\S]*남음 6,917[\s\S]*상세 1,000\/1,000/);
});
