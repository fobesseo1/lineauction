import {test} from 'node:test';import assert from 'node:assert/strict';import {classifyHealth,pipelineHealth} from './monitor-core.mjs';
const now=Date.parse('2026-10-08T03:00:00Z');
const base={progress:{status:'running',startedAt:new Date(now-3600000).toISOString()},alive:true,lastActivityAt:new Date(now-10000).toISOString(),now};
test('process alive does not hide a stalled collector',()=>{assert.equal(classifyHealth(base).state,'healthy');assert.equal(classifyHealth({...base,lastActivityAt:new Date(now-180000).toISOString()}).state,'delayed');});
test('dead process and permission failure are distinct',()=>{assert.equal(classifyHealth({...base,alive:false}).state,'error');assert.equal(classifyHealth({...base,alive:null}).state,'unknown');});
test('database sync gets its own longer stall threshold',()=>{const input={...base,progress:{...base.progress,syncStatus:'running'},lastActivityAt:new Date(now-180000).toISOString()};assert.equal(classifyHealth(input).label,'DB 반영 중');assert.equal(classifyHealth({...input,lastActivityAt:new Date(now-1000000).toISOString()}).state,'delayed');});
test('blocked or finished run never appears healthy',()=>{assert.equal(classifyHealth({...base,progress:{status:'blocked'}}).state,'error');assert.equal(classifyHealth({...base,progress:{status:'pass-finished'},alive:false}).state,'stopped');assert.equal(classifyHealth({...base,progress:null}).state,'unavailable');});
test('failed database sync is visible even while collection advances',()=>{assert.equal(classifyHealth({...base,progress:{...base.progress,syncStatus:'failed'}}).state,'warning');});
test('automatic recovery is visible but cannot hide a stalled process',()=>{const input={...base,progress:{...base.progress,status:'recovering',recovery:{delaySeconds:30}}};assert.equal(classifyHealth(input).state,'recovering');assert.equal(classifyHealth({...input,lastActivityAt:new Date(now-180000).toISOString()}).state,'delayed');assert.equal(classifyHealth({...input,alive:false}).state,'error');});
test('matching refusal is deferred without claiming database storage failed',()=>{
 const stamp=new Date(now-20000).toISOString();
 const progress={...base.progress,syncStatus:'failed',lastSyncAt:stamp};
 const pipeline={finishedAt:stamp,errors:[{stage:'matching',key:'a',message:'MOLIT HTTP 429'}]};
 const stages=pipelineHealth(pipeline,progress,{matchingPaused:true});
 assert.equal(stages.database.state,'completed');assert.equal(stages.database.errors,0);
 assert.equal(stages.matching.state,'paused');assert.equal(stages.matching.pending,1);
 assert.equal(classifyHealth({...base,progress,pipeline,matchingPaused:true}).state,'healthy');
});
test('real database errors stay visible even when matching is paused',()=>{
 const stamp=new Date(now-20000).toISOString();
 const progress={...base.progress,syncStatus:'failed',lastSyncAt:stamp};
 const pipeline={finishedAt:stamp,errors:[{stage:'properties',message:'write failed'},{stage:'matching',key:'a'}]};
 assert.equal(pipelineHealth(pipeline,progress,{matchingPaused:true}).database.errors,1);
 assert.equal(classifyHealth({...base,progress,pipeline,matchingPaused:true}).label,'DB 저장 오류');
});
test('old successful report cannot mask a newer failed database run',()=>{
 const progress={...base.progress,syncStatus:'failed',lastSyncAt:new Date(now-1000).toISOString()};
 const pipeline={finishedAt:new Date(now-60000).toISOString(),errors:[]};
 assert.equal(pipelineHealth(pipeline,progress).database.state,'unknown');
 assert.equal(classifyHealth({...base,progress,pipeline}).label,'DB 반영 결과 확인 필요');
});
