import test from 'node:test';
import assert from 'node:assert/strict';
import {withOperationDeadline as deadline} from './operation-deadline.mjs';
test('host deadline rejects a browser operation that never answers',async()=>{await assert.rejects(deadline(()=>new Promise(()=>{}),20,'screen'),e=>e.name==='TimeoutError'&&/host deadline/.test(e.message));});
test('successful operations and original errors are preserved',async()=>{assert.equal(await deadline(async()=>7,100,'screen'),7);await assert.rejects(deadline(async()=>{throw Error('access denied');},100,'screen'),/access denied/);});
