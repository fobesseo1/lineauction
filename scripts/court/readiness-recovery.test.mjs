import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForScreenReady as ready} from './readiness-recovery.mjs';
const timeout=()=>Object.assign(Error('screen timed out'),{name:'TimeoutError'});
const setup=overrides=>({observe:async()=>{},guard:async()=>{},stopped:async()=>false,record:async()=>{},budget:{remaining:2},stage:'court-options',timeout:20000,...overrides});
test('slow screen gets one passive extension and consumes global budget',async()=>{const times=[];const args=setup({observe:async ms=>{times.push(ms);if(times.length===1)throw timeout();}});await ready(args);assert.deepEqual(times,[20000,40000]);assert.equal(args.budget.remaining,1);});
test('second timeout propagates and records the failing screen',async()=>{let calls=0;const events=[];await assert.rejects(ready(setup({observe:async()=>{calls++;throw timeout();},record:async e=>events.push(e)})));assert.equal(calls,2);assert.equal(events[1].screen,'court-options');});
test('access denial, STOP, exhausted budget prevent extension',async()=>{for(const overrides of [{guard:async()=>{throw Error('denied');}},{stopped:async()=>true},{budget:{remaining:0}}]){let calls=0;await assert.rejects(ready(setup({...overrides,observe:async()=>{calls++;throw timeout();}})));assert.equal(calls,1);}});
test('non-timeout errors are not recovered',async()=>{let calls=0;await assert.rejects(ready(setup({observe:async()=>{calls++;throw Error('invalid screen');}})),/invalid screen/);assert.equal(calls,1);});

test('body-read timeout during screen transition permits only passive observation and must pass final guard',async()=>{let observes=0,guards=0;const events=[];await ready(setup({observe:async()=>{if(++observes===1)throw timeout();},guard:async()=>{if(++guards===1)throw timeout();},record:async e=>events.push(e)}));assert.equal(observes,2);assert.equal(guards,2);assert.equal(events[1].stage,'screen-timeout');assert.equal(events[2].stage,'guard-read-timeout');});
test('persistent unreadable body still fails after bounded passive observation',async()=>{let observes=0;const args=setup({observe:async()=>{if(++observes===1)throw timeout();},guard:async()=>{throw timeout();}});await assert.rejects(ready(args),/timed out/);assert.equal(observes,2);assert.equal(args.budget.remaining,1);});
