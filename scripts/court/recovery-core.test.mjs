import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isRecoverableError,withCourtRecovery} from './recovery-core.mjs';
test('only transient waits and changed lists are recoverable',()=>{
 for(const message of ['page.waitForFunction: Timeout 20000ms exceeded.','List changed during details; refresh on resume','List failed to stabilize'])assert.ok(isRecoverableError(Error(message)));
 for(const message of ['Official site denied access; stopped without bypass','Official access challenge; stopped without bypass','HTTP 429','Selected court mismatch','Last page not verified','Unknown table structure','Standalone collector lock exists'])assert.equal(isRecoverableError(Error(message)),false);
});
test('changed list reruns fresh operation and keeps saved progress',async()=>{let calls=0,saved=10;const retries=[];const result=await withCourtRecovery(async()=>{calls++;if(calls===1){saved++;throw Error('List changed during details; refresh on resume');}return 'done';},{getSaved:()=>saved,onRetry:r=>retries.push(r)});assert.equal(result,'done');assert.equal(saved,11);assert.equal(calls,2);assert.equal(retries[0].delaySeconds,10);});
test('three unsuccessful retries stop and use increasing delays',async()=>{const delays=[];let calls=0;await assert.rejects(withCourtRecovery(async()=>{calls++;throw Error('Timeout 20000ms exceeded');},{onRetry:r=>delays.push(r.delaySeconds)}),/Timeout/);assert.equal(calls,4);assert.deepEqual(delays,[10,30,60]);});
test('saved progress resets consecutive budget but total retries stay bounded',async()=>{let saved=0,calls=0;await assert.rejects(withCourtRecovery(async()=>{calls++;saved++;throw Error('List failed to stabilize');},{getSaved:()=>saved,maxTotalRetries:4,onRetry:()=>{}}),/stabilize/);assert.equal(calls,5);});
test('access refusal and user stop never retry',async()=>{let retries=0;await assert.rejects(withCourtRecovery(async()=>{throw Error('Timeout 20000ms exceeded');},{isBlocked:()=>true,onRetry:()=>retries++}),/Timeout/);assert.equal(retries,0);assert.equal(await withCourtRecovery(async()=>{throw Error('Timeout 20000ms exceeded');},{onRetry:()=>false}),'stop');});
