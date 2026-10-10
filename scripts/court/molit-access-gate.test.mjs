import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {assertMolitAllowed,recordMolitRefusal} from './molit-access-gate.mjs';
test('same-day refusal blocks, next day permits retry, third consecutive refusal notifies once',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'molit-gate-')),p=join(dir,'pause.json');
 try{for(let d=9;d<=12;d++){const now=new Date('2026-10-'+String(d).padStart(2,'0')+'T03:00:00Z');await assertMolitAllowed(p,{now});const r=await recordMolitRefusal(429,p,null,{now});assert.equal(r.consecutiveDays,d-8);assert.equal(r.notifyUser,d===11);await assert.rejects(assertMolitAllowed(p,{now}),/paused/);await recordMolitRefusal(403,p,null,{now});assert.equal(JSON.parse(await readFile(p)).status,429);}
 const gap=new Date('2026-10-14T03:00:00Z');assert.equal((await recordMolitRefusal(200,p,'22',{now:gap})).consecutiveDays,1);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Korean midnight releases legacy pause while preserving history',async()=>{const dir=await mkdtemp(join(tmpdir(),'molit-gate-')),p=join(dir,'pause.json');try{await writeFile(p,JSON.stringify({status:403,pausedAt:'2026-10-09T14:59:00Z'}));await assert.rejects(assertMolitAllowed(p,{now:new Date('2026-10-09T14:59:59Z')}),/paused/);await assertMolitAllowed(p,{now:new Date('2026-10-09T15:00:00Z')});assert.equal(JSON.parse(await readFile(p)).status,403);}finally{await rm(dir,{recursive:true,force:true});}});
test('503 does not pause but official rejection code does',async()=>{const dir=await mkdtemp(join(tmpdir(),'molit-gate-')),p=join(dir,'pause.json');try{await recordMolitRefusal(503,p);await assertMolitAllowed(p);await recordMolitRefusal(200,p,'30');await assert.rejects(assertMolitAllowed(p),/paused/);}finally{await rm(dir,{recursive:true,force:true});}});

