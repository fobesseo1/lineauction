// Independent, user-authorized initial collection. No scheduler, login reuse, HTTP replay or stealth.
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile, open, unlink, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { parseList, parseDetail, COURT_URL } from './core.mjs';
import { inSeoulGyeonggi } from './scope.mjs';
import { saveRun, replaceFile } from './store.mjs';
import { saveMedia } from './media.mjs';
import {readAllOfficialPhotos} from './all-photos.mjs';
import { withCourtRecovery } from './recovery-core.mjs';
import { needsRepair, repairAudit } from './repair-audit.mjs';

const root='data/court/standalone';
await mkdir(root,{recursive:true});
const args=process.argv.slice(2);
const repairPass=args.includes('--repair-pass');
const option=(key,fallback)=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3)??fallback;
const limit=Number(option('limit','20'));
if(!Number.isInteger(limit)||limit<1)throw Error('Positive item limit required');
const syncEvery=Number(option('sync-every','0'));
if(!Number.isInteger(syncEvery)||syncEvery<0)throw Error('Invalid synchronization interval');
const startPage=Number(option('start-page','1'));
if(!Number.isInteger(startPage)||startPage<1)throw Error('Invalid start page');
const allCourts=JSON.parse(await readFile('scripts/court/courts.json','utf8')).slice(0,16);
const selected=option('court',null);
if(selected&&!allCourts.includes(selected))throw Error('Court outside Seoul/Gyeonggi jurisdiction scope');
const courts=selected?[selected]:allCourts;
const atomic=async(path,value)=>{const temporary=`${path}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(value,null,2));await replaceFile(temporary,path);};
const load=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return fallback;}};
const lockPath=`${root}/running.lock`;
const lock=await open(lockPath,'wx').catch(()=>{throw Error('Standalone collector lock exists; do not run two writers');});
await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
const progress={id:randomUUID(),pid:process.pid,status:'starting',scope:'seoul-gyeonggi',startedAt:new Date().toISOString(),limit,attempted:0,succeeded:0,failed:0,photos:0,skipped:0,errors:[],timings:[]};
const record=async(event)=>{await appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),run:progress.id,...event})+'\n');await atomic(`${root}/progress.json`,progress);console.log(JSON.stringify(event));};
const sync=async()=>{
 progress.syncStatus='running';await record({stage:'sync-start'});
 const log=await open(`${root}/pipeline.log`,'a');
 try{
  const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/court/pipeline.mjs'],{stdio:['ignore',log.fd,log.fd],windowsHide:true});child.once('error',reject);child.once('exit',resolve);});
  const report=await load('data/court/pipeline/latest.json',{});
  progress.syncStatus=code===0&&!(report.errors?.length)?'completed':'failed';
  progress.lastSyncAt=new Date().toISOString();
  await record({stage:'sync-finish',status:progress.syncStatus,exitCode:code,errors:report.errors?.length??null});
 }catch(error){progress.syncStatus='failed';progress.syncError=error.message;await record({stage:'sync-failed',message:error.message});}finally{await log.close();}
};
let browser;
let stop=false;
process.on('SIGINT',()=>{stop=true;});process.on('SIGTERM',()=>{stop=true;});
let blocked=false;
const checks=await load(`${root}/photo-checks.json`,{});
// Persist a completed page only after every eligible item on it has been visited.
const checkpointPath=`${root}/${repairPass?'repair-checkpoint':'checkpoint'}.json`;
const checkpoint=await load(checkpointPath,{date:null,courts:{}});
const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
if(checkpoint.date!==today){checkpoint.date=today;checkpoint.courts={};}
const repairSeen=repairPass?await load(`${root}/repair-seen.json`,{date:today,keys:[]}):{date:today,keys:[]};
const seen=new Set(repairSeen.date===today?repairSeen.keys:[]);
const photographed=new Set((await load('data/court/media/manifest.json',[])).map(x=>x.key));
try{
 browser=await chromium.launch({channel:'msedge',headless:true});
 let pendingRequests=new Set(),lastNetworkActivity=Date.now();
 const createPage=async()=>{
  pendingRequests=new Set();lastNetworkActivity=Date.now();
  const next=await browser.newPage({locale:'ko-KR'});
  next.setDefaultTimeout(15000);
  // Observe browser loading only; never replay private endpoints. A selected page number
  // can update before its rows arrive, so unchanged old rows alone are not readiness.
  const relevant=request=>new URL(request.url()).hostname==='www.courtauction.go.kr'&&['xhr','fetch','document'].includes(request.resourceType())&&!new URL(request.url()).pathname.endsWith('/pgj111/selectRletYrDspslStats.on');
  next.on('request',request=>{if(relevant(request)){pendingRequests.add(request);lastNetworkActivity=Date.now();}});
  const finished=request=>{if(pendingRequests.delete(request))lastNetworkActivity=Date.now();};
  next.on('requestfinished',finished);next.on('requestfailed',finished);
  next.on('response',response=>{if(new URL(response.url()).hostname==='www.courtauction.go.kr'&&[403,429].includes(response.status()))blocked=true;});
  next.on('dialog',async dialog=>{progress.lastDialog=dialog.message();if(/차단|비정상|자동입력|보안문자|접속.*제한/.test(dialog.message()))blocked=true;await dialog.dismiss();});
  return next;
 };
 let page=await createPage();
 const guard=async()=>{
  if(blocked)throw Error('Official site denied access; stopped without bypass');
  const text=await page.locator('body').innerText();
  if(/비정상적인 접근|자동입력 방지문자|접속이 차단|요청 횟수.*초과/.test(text))throw Error('Official access challenge; stopped without bypass');
 };
 const table=()=>page.getByRole('table',{name:'물건번호,소재지 및 내역,비고,용도 을(를) 나타낸 표',exact:true});
 // WebSquare keeps old rows hidden on a short final page. They are not current results.
 const rows=()=>table().locator('tbody tr:visible').evaluateAll(es=>es.map(row=>Array.from(row.querySelectorAll('td')).map(c=>({text:c.innerText,rowSpan:c.rowSpan,links:Array.from(c.querySelectorAll('a')).map(a=>a.innerText)}))));
 const stableRows=async()=>{
  await table().waitFor({state:'visible'});
  await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
  let previous=JSON.stringify(await rows()),same=0;
  for(let n=0;n<100;n++){await delay(200);const next=JSON.stringify(await rows());same=next===previous?same+1:0;if(same>=3&&pendingRequests.size===0&&Date.now()-lastNetworkActivity>=800&&JSON.parse(next).some(c=>c.length===8))return JSON.parse(next);previous=next;}
  await atomic(`${root}/list-loading.json`,{pending:[...pendingRequests].map(request=>request.url()),quietMs:Date.now()-lastNetworkActivity,rows:await rows()});
  throw Error('List failed to stabilize');
 };
 const goPage=async(number)=>{
  await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
  for(let n=0;n<100;n++){
   await guard();
   const current=await page.getByRole('button',{name:String(number),exact:true}).count();
   if(current){const target=page.getByRole('button',{name:String(number),exact:true});if(await target.getAttribute('title')==='선택됨')return;await target.click();await page.waitForFunction(number=>Array.from(document.querySelectorAll('[title="선택됨"]')).some(e=>e.textContent.trim()===String(number)),number,{timeout:15000});await stableRows();return;}
   const numbers=await page.getByRole('button').evaluateAll(es=>es.filter(e=>/^\d+$/.test(e.innerText.trim())).map(e=>Number(e.innerText.trim())));
   await page.getByRole('button',{name:number<Math.min(...numbers)?'이전 목록':'다음 목록',exact:true}).click();await delay(350);
  }throw Error('Pagination limit');
 };
 progress.status='running';await record({stage:'start',courts,limit});
 let consecutiveFailures=0;
 outer:for(const court of courts){
  if(checkpoint.courts[court]?.complete)continue;
  const outcome=await withCourtRecovery(async()=>{
  await page.goto(COURT_URL,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#mf_sbx_rletRpdtCortLst').selectOption({label:court});
  await page.getByRole('button',{name:'검색하기',exact:true}).click();
  await table().waitFor({timeout:20000});await guard();
  await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
  const initialQuery=await page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
  if(!initialQuery.includes(court))throw Error('Selected court mismatch');
  if(/총 물건수\s*0건/.test(initialQuery)){
   await saveRun({schemaVersion:1,court,pageSize:40,pages:[{court,page:1,displayedTotal:0,rows:[],observedAt:new Date().toISOString(),sourceUrl:page.url()}],details:{},detailJobs:[],errors:[],pagination:{startPage:1,lastPage:1,reachedLastPage:true,nextPage:null}});
   checkpoint.courts[court]={nextPage:1,complete:true,total:0,checkedAt:new Date().toISOString()};await atomic(checkpointPath,checkpoint);return;
  }
  await page.getByRole('combobox',{name:'페이지당 수 선택',exact:true}).selectOption('40');
  await stableRows();
  const query=await page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
  if(!query.includes(court))throw Error('Selected court mismatch');
  const total=Number(query.match(/총 물건수\s*([\d,]+)건/)?.[1]?.replaceAll(',',''));
  if(!Number.isInteger(total))throw Error('Result total unavailable');
  await page.getByRole('button',{name:'마지막 페이지',exact:true}).click();await stableRows();
  const end=await page.getByRole('button').evaluateAll(es=>es.filter(e=>/^\d+$/.test(e.innerText.trim())).map(e=>({number:Number(e.innerText.trim()),selected:e.title==='선택됨'})));
  const lastPage=end.find(p=>p.selected)?.number;
  if(!lastPage||lastPage<Math.ceil(total/40)||lastPage!==Math.max(...end.map(p=>p.number)))throw Error('Last page not verified');
  await page.getByRole('button',{name:'첫 페이지',exact:true}).click();await stableRows();
  for(let number=Math.max(startPage,checkpoint.courts[court]?.nextPage??1);number<=lastPage;number++){
   if(stop)return 'stop';
   try{await readFile(`${root}/STOP`);stop=true;return 'stop';}catch(e){if(e.code!=='ENOENT')throw e;}
   await goPage(number);
   const observedRows=await stableRows();
   const snapshot={court,page:number,displayedTotal:total,rows:observedRows,observedAt:new Date().toISOString(),sourceUrl:page.url()};
   const items=parseList(snapshot);
   const base={schemaVersion:1,court,pageSize:40,pages:[snapshot],details:{},detailJobs:[],errors:[],pagination:{startPage:number,reachedLastPage:false,nextPage:number+1}};
   await saveRun(base);
   let state=await load('data/court/current.json',{});
   const eligible=items.filter(item=>item.assetCategory==='real-estate'&&inSeoulGyeonggi(item));
   for(const item of eligible)seen.add(item.key);
   for(const item of eligible){
    if(!needsRepair(state.items[item.key],checks[item.key],photographed,new Date().toISOString().slice(0,10))){progress.skipped++;continue;}
    try{await readFile(`${root}/STOP`);stop=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(progress.attempted>=limit||stop)return 'stop';
    const began=Date.now();progress.attempted++;progress.current={court,page:number,key:item.key};
    let detailSaved=false;
    try{
     await guard();
     const index=observedRows.findIndex(c=>c.length===8&&c[1].text.match(/\d{4}타경\d+/)?.[0]===item.caseNumber&&Number(c[2].text.trim())===item.itemNumber);
     if(index<0)throw Error('Item absent from validated list');
     await table().locator('tbody tr:visible').nth(index).getByRole('link',{name:observedRows[index][3].links[0].trim(),exact:true}).click();
     await page.waitForFunction(({caseNumber,itemNumber})=>{
      const text=Array.from(document.querySelectorAll('table')).filter(e=>e.getClientRects().length).map(e=>e.innerText).join('\n\n');
      return text.match(/사건번호\s*(\d{4}타경\d+)/)?.[1]===caseNumber&&text.replace(/\s/g,'').includes(`물건번호${itemNumber}물건종류`);
     },item,{timeout:20000});
     await guard();
     const raw=await page.locator('table:visible').evaluateAll(es=>es.map(e=>e.innerText).join('\n\n'));
     parseDetail(raw,item);
     const stamp=new Date().toISOString();
     const run={...base,pages:[{...snapshot,observedAt:stamp}],details:{[item.key]:raw},detailJobs:[{key:item.key,page:number,state:'succeeded',attempts:1}]};
     await saveRun(run);detailSaved=true;
     // Original bytes stay in this process: no model/tool chunk transfer.
     await delay(500);
     const photos=await readAllOfficialPhotos(page);
     let media=null;
     if(photos.length){media=await saveMedia({kind:'court-media',key:item.key,court,caseNumber:item.caseNumber,itemNumber:item.itemNumber,sourceUrl:page.url(),observedAt:stamp,detailRaw:raw,photos});progress.photos+=media.photos;photographed.add(item.key);}
     checks[item.key]={state:photos.length?'captured':'none-visible',checkedAt:stamp};
     await atomic(`${root}/photo-checks.json`,checks);
     progress.succeeded++;consecutiveFailures=0;
     progress.timings.push({key:item.key,ms:Date.now()-began,photos:media?.photos??0});
     await record({stage:'saved',key:item.key,ms:Date.now()-began,detail:true,photo:media});
     if(syncEvery&&progress.succeeded%syncEvery===0)await sync();
    }catch(error){
     progress.failed++;consecutiveFailures++;progress.errors.push({key:item.key,message:error.message,detailSaved});
     if(!detailSaved)await saveRun({...base,pages:[{...snapshot,observedAt:new Date().toISOString()}],detailJobs:[{key:item.key,page:number,state:'failed',attempts:1,error:error.message}],errors:[{stage:'detail',key:item.key,page:number,message:error.message}]});
     await record({stage:'failed',key:item.key,message:error.message,detailSaved});
     if(blocked||/access challenge|denied access/.test(error.message)||consecutiveFailures>=3)throw error;
    }
    if(!await table().isVisible())await page.getByRole('button',{name:'이전',exact:true}).last().click();
    await goPage(number);
    const returnedRows=await stableRows();
    if(JSON.stringify(returnedRows)!==JSON.stringify(observedRows)){
     await atomic(`${root}/list-change.json`,{court,page:number,key:item.key,before:observedRows,after:returnedRows});
     throw Error('List changed during details; refresh on resume');
    }
    state=await load('data/court/current.json',{});
    await delay(500);
   }
   checkpoint.courts[court]={nextPage:number+1,complete:number===lastPage,total,checkedAt:new Date().toISOString()};
   await atomic(checkpointPath,checkpoint);
   if(repairPass)await atomic(`${root}/repair-seen.json`,{date:today,keys:[...seen]});
   await record({stage:'page-checked',court,page:number,eligible:eligible.length,nextPage:number+1,complete:number===lastPage});
  }
  },{getSaved:()=>progress.succeeded,isBlocked:()=>blocked,onRetry:async({error,attempt,total,delaySeconds})=>{
   progress.status='recovering';
   progress.recovery={court,attempt,total,delaySeconds,message:error.message,at:new Date().toISOString()};
   await record({stage:'recovery-wait',...progress.recovery});
   // Fresh browser context avoids retaining a failed search/session or stale detail page.
   for(let second=0;second<delaySeconds;second++){
    if(stop)return false;
    try{await readFile(`${root}/STOP`);stop=true;return false;}catch(e){if(e.code!=='ENOENT')throw e;}
    await delay(1000);
   }
   await page.context().close();
   page=await createPage();
   consecutiveFailures=0;progress.status='running';
   await record({stage:'recovery-restart',court,attempt,total});
   return true;
  }});
  if(outcome==='stop')break outer;
 }
 progress.status=stop?'stopped':progress.attempted>=limit?'limit-reached':progress.failed?'pass-finished-with-errors':'pass-finished';
 if(syncEvery&&(repairPass||progress.succeeded%syncEvery!==0))await sync();
 if(repairPass){
  const audit=repairAudit(await load('data/court/current.json',{}),{media:await load('data/court/media/manifest.json',[]),checks,seen:[...seen],courts,completedCourts:Object.entries(checkpoint.courts).filter(([,v])=>v.complete).map(([k])=>k),run:progress.id,startedAt:progress.startedAt,finishedAt:new Date().toISOString()});
  await atomic(`${root}/repair-audit.json`,audit);
  await record({stage:'repair-audit',counts:audit.counts,allCourtsTraversed:audit.allCourtsTraversed,collectionComplete:false});
 }
}catch(error){progress.status='blocked';progress.error=error.message;process.exitCode=1;
 const page=browser?.contexts()[0]?.pages()[0];
 if(page){await page.screenshot({path:`${root}/last-error.png`,fullPage:true}).catch(()=>{});await writeFile(`${root}/last-error.txt`,await page.locator('body').innerText().catch(()=>''));}
}
finally{
 progress.finishedAt=new Date().toISOString();
 progress.elapsedMs=Date.now()-Date.parse(progress.startedAt);
 progress.meanItemMs=progress.timings.length?Math.round(progress.timings.reduce((s,t)=>s+t.ms,0)/progress.timings.length):null;
 await record({stage:'finish',status:progress.status,attempted:progress.attempted,succeeded:progress.succeeded,failed:progress.failed,photos:progress.photos,elapsedMs:progress.elapsedMs,meanItemMs:progress.meanItemMs,error:progress.error});
 await atomic(`${root}/run-${progress.id}.json`,progress);
 await browser?.close();await lock.close();await unlink(lockPath);
}
