import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluate,due} from './watch-core.mjs';

const at=(iso)=>Date.parse(iso),MIN=60000;
const base={day:'2026-10-11',history:[],lock:null,lockAlive:false,activityAt:0};

test('quiet before the scheduled hour plus 30 minutes, missed start after it',()=>{
 assert.equal(evaluate({...base,now:at('2026-10-11T01:20:00Z')}).length,0); // 10:20 KST
 const p=evaluate({...base,now:at('2026-10-11T01:31:00Z')}); // 10:31 KST
 assert.deepEqual(p.map(x=>x.key),['missed:onbid:2026-10-11']);
 assert.equal(evaluate({...base,now:at('2026-10-11T01:31:00Z'),history:[{job:'onbid',day:'2026-10-11',status:'skipped'}]}).length,0);
});
test('stall and crash detection while a job holds the lock',()=>{
 const lock={job:'court',startedAt:'2026-10-11T06:00:00Z',pid:1};
 const now=at('2026-10-11T07:00:00Z');
 assert.match(evaluate({...base,now,lock,lockAlive:true,activityAt:now-30*MIN})[0].key,/^stalled:court/);
 assert.equal(evaluate({...base,now,lock,lockAlive:true,activityAt:now-10*MIN}).filter(p=>p.key.startsWith('stalled')).length,0);
 assert.match(evaluate({...base,now,lock,lockAlive:false})[0].key,/^crashed:court/);
});
test('failed runs repeat every 3 hours without duplicating the runner notice; blocked streak at 3 days',()=>{
 const now=at('2026-10-11T07:00:00Z'),history=[{job:'court',day:'2026-10-11',status:'failed',startedAt:'x',trigger:'schedule'}];
 const [failed]=evaluate({...base,now,history}).filter(p=>p.key.startsWith('failed'));
 assert.equal(due([failed],{},now).length,0);
 assert.equal(due([failed],{[failed.key]:now-179*MIN},now).length,0);
 assert.equal(due([failed],{[failed.key]:now-180*MIN},now).length,1);
 assert.equal(evaluate({...base,now,blockedStreaks:{molit:2}}).filter(p=>p.key.startsWith('blocked')).length,0);
 assert.equal(evaluate({...base,now,blockedStreaks:{molit:3}}).filter(p=>p.key.startsWith('blocked')).length,1);
});
