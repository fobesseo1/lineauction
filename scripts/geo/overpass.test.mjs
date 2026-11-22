import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,utimes,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cachedAnswer,fetchOverpass} from './overpass.mjs';

const dir=await mkdtemp(join(tmpdir(),'overpass-'));
const old=async(p,days)=>{const t=new Date(Date.now()-days*86400_000);await utimes(p,t,t);};
const fail=async()=>{throw Error('OVERPASS_502');};

test('cachedAnswer uses a fresh cache without fetching',async()=>{
 const p=join(dir,'fresh.json');await writeFile(p,'{"elements":[1]}');
 const r=await cachedAnswer(p,30,fail);
 assert.equal(r.status,'cached');assert.deepEqual(r.data,{elements:[1]});
});
test('cachedAnswer refetches an old cache and writes it',async()=>{
 const p=join(dir,'old.json');await writeFile(p,'{"elements":[1]}');await old(p,40);
 const r=await cachedAnswer(p,30,async()=>({elements:[2]}));
 assert.equal(r.status,'fetched');assert.deepEqual(JSON.parse(await readFile(p,'utf8')),{elements:[2]});
});
test('cachedAnswer keeps the old answer when the server fails (2026-11-22 OSM 502)',async()=>{
 const p=join(dir,'stale.json');await writeFile(p,'{"elements":[1]}');await old(p,40);
 const r=await cachedAnswer(p,30,fail);
 assert.equal(r.status,'stale');assert.deepEqual(r.data,{elements:[1]});assert.equal(r.error.message,'OVERPASS_502');
});
test('cachedAnswer reports a part never fetched as missing',async()=>{
 const r=await cachedAnswer(join(dir,'none.json'),30,fail);
 assert.equal(r.status,'missing');assert.equal(r.data,null);
});
test('fetchOverpass moves to the next server after a failure',async()=>{
 const seen=[];const real=globalThis.fetch;
 globalThis.fetch=async url=>{seen.push(url);return seen.length===1?new Response('busy',{status:502}):new Response('{"elements":[]}');};
 try{
  const r=await fetchOverpass('q',{allowEmpty:true,urls:['a','b'],wait:0});
  assert.deepEqual(r,{elements:[]});assert.deepEqual(seen,['a','b']);
 }finally{globalThis.fetch=real;}
});
test('fetchOverpass treats an empty whole-area answer as a failure',async()=>{
 const real=globalThis.fetch;globalThis.fetch=async()=>new Response('{"elements":[]}');
 try{await assert.rejects(fetchOverpass('q',{urls:['a'],wait:0}),/OVERPASS_EMPTY/);}finally{globalThis.fetch=real;}
});
