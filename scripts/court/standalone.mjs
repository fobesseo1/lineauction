// Independent, user-authorized initial collection. No scheduler, login reuse, HTTP replay or stealth.
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile, open, unlink, appendFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { parseList, parseDetail, COURT_URL } from './core.mjs';
import { inSeoulGyeonggi } from './scope.mjs';
import { saveRun, replaceFile } from './store.mjs';
import { withCourtRecovery } from './recovery-core.mjs';
import { withOperationDeadline } from './operation-deadline.mjs';
import { needsCourtDetail, repairAudit } from './repair-audit.mjs';
import { isApartmentUse } from '../property-section.mjs';

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
// Daily runs search 건물 > 주거용건물 > 아파트 only; the weekly full pass (--uses=all) reads every use
// so hidden-apartments.mjs can find apartments the court filed under another use.
const uses=option('uses','apartment');
if(!['apartment','all'].includes(uses))throw Error('--uses must be apartment or all');
const DETAIL_SEARCH_URL='https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ151F00.xml';
const hiddenRegistry=JSON.parse(await readFile('data/court/hidden-apartments.json','utf8').catch(e=>{if(e.code==='ENOENT')return '{"items":{}}';throw e;}));
const hiddenKeys=new Set(Object.keys(hiddenRegistry.items??{}));
// Hidden apartments are not in the apartment search, so the apartment run looks each case up by number.
const caseTargets=uses==='apartment'&&(!selected||args.includes('--cases-only'))?[...new Map(Object.values(hiddenRegistry.items??{}).map(h=>[`${h.court}#${h.caseNumber}`,{id:`${h.court}#${h.caseNumber}`,court:h.court,caseNumber:h.caseNumber}])).values()]:[];
// --cases-only: look up just the hidden apartments (manual check or rerun).
const targets=args.includes('--cases-only')?caseTargets:[...courts.map(court=>({id:court,court})),...caseTargets];
const atomic=async(path,value)=>{const temporary=`${path}.${randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(value,null,2),{flush:true});await replaceFile(temporary,path);};
const load=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return fallback;}};
const lockPath=`${root}/running.lock`;
const lock=await open(lockPath,'wx').catch(()=>{throw Error('Standalone collector lock exists; do not run two writers');});
await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
const progress={id:randomUUID(),pid:process.pid,status:'starting',scope:'seoul-gyeonggi',startedAt:new Date().toISOString(),limit,attempted:0,succeeded:0,failed:0,photos:0,skipped:0,excludedByUse:{},errors:[],timings:[]};
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
if(checkpoint.date!==today||(checkpoint.uses??'all')!==uses){checkpoint.date=today;checkpoint.uses=uses;checkpoint.courts={};}
const repairSeen=repairPass?await load(`${root}/repair-seen.json`,{date:today,keys:[]}):{date:today,keys:[]};
const seen=new Set(repairSeen.date===today?repairSeen.keys:[]);
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
 // Host deadlines: a frozen page (2026-11-11: one detail hung 15 min, one page move 26 min) fails fast
 // and goes to the browser restart in withCourtRecovery instead of waiting.
 const STEP_DEADLINE_MS=Number(process.env.COURT_STEP_DEADLINE_MS??180000);
 const deadline=(work,label)=>withOperationDeadline(work,STEP_DEADLINE_MS,label);
 const stableRowsRaw=async()=>{
  await table().waitFor({state:'visible'});
  await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
  let previous=JSON.stringify(await rows()),same=0;
  for(let n=0;n<100;n++){await delay(200);const next=JSON.stringify(await rows());same=next===previous?same+1:0;if(same>=3&&pendingRequests.size===0&&Date.now()-lastNetworkActivity>=800&&JSON.parse(next).some(c=>c.length===8))return JSON.parse(next);previous=next;}
  await atomic(`${root}/list-loading.json`,{pending:[...pendingRequests].map(request=>request.url()),quietMs:Date.now()-lastNetworkActivity,rows:await rows()});
  throw Error('List failed to stabilize');
 };
 const stableRows=()=>deadline(stableRowsRaw,'list read');
 const goPageRaw=async(number)=>{
  await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
  for(let n=0;n<100;n++){
   await guard();
   const current=await page.getByRole('button',{name:String(number),exact:true}).count();
   if(current){const target=page.getByRole('button',{name:String(number),exact:true});if(await target.getAttribute('title')==='선택됨')return;await target.click();await page.waitForFunction(number=>Array.from(document.querySelectorAll('[title="선택됨"]')).some(e=>e.textContent.trim()===String(number)),number,{timeout:15000});await stableRows();return;}
   const numbers=await page.getByRole('button').evaluateAll(es=>es.filter(e=>/^\d+$/.test(e.innerText.trim())).map(e=>Number(e.innerText.trim())));
   await page.getByRole('button',{name:number<Math.min(...numbers)?'이전 목록':'다음 목록',exact:true}).click();await delay(350);
  }throw Error('Pagination limit');
 };
 const goPage=number=>deadline(()=>goPageRaw(number),'page move');
 progress.status='running';await record({stage:'start',courts,limit});
 let consecutiveFailures=0;
 // Full pass: the main page's court search (every use). Apartment pass: the detailed search with
 // 건물 > 주거용건물 > 아파트, or one case number for a hidden apartment.
 const searchRaw=async target=>{
  if(uses==='all'&&!target.caseNumber){
   await page.goto(COURT_URL,{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator('#mf_sbx_rletRpdtCortLst').selectOption({label:target.court});
   await page.getByRole('button',{name:'검색하기',exact:true}).click();
  }else{
   const p='#mf_wfm_mainFrame_';
   await page.goto(DETAIL_SEARCH_URL,{waitUntil:'domcontentloaded',timeout:45000});
   await page.locator(p+'sbx_rletCortOfc').selectOption({label:target.court});
   if(target.caseNumber){
    const [year,number]=target.caseNumber.split('타경');
    await page.locator(p+'sbx_rletCsYear').selectOption({label:year});
    await page.locator(p+'ibx_rletCsNo').fill(number);
   }else{
    await page.locator(p+'sbx_rletLclLst').selectOption({label:'건물'});
    await page.waitForFunction(s=>Array.from(document.querySelectorAll(s+' option')).some(o=>o.text==='주거용건물'),p+'sbx_rletMclLst',{timeout:15000});
    await page.locator(p+'sbx_rletMclLst').selectOption({label:'주거용건물'});
    await page.waitForFunction(s=>Array.from(document.querySelectorAll(s+' option')).some(o=>o.text==='아파트'),p+'sbx_rletSclLst',{timeout:15000});
    await page.locator(p+'sbx_rletSclLst').selectOption({label:'아파트'});
   }
   await page.locator(p+'btn_gdsDtlSrch').click();
  }
  await table().waitFor({timeout:20000});await guard();
  await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
  const query=await page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
  if(!query.includes(target.court))throw Error('Selected court mismatch');
  if(target.caseNumber&&!query.includes(target.caseNumber))throw Error('Selected case mismatch');
  if(uses==='apartment'&&!target.caseNumber&&!/주거용건물\s*>\s*아파트/.test(query))throw Error('Apartment filter not applied');
  return query;
 };
 const search=target=>deadline(()=>searchRaw(target),'search');
 outer:for(const target of targets){
  const court=target.court;
  if(checkpoint.courts[target.id]?.complete)continue;
  let outcome;
  try{
  outcome=await withCourtRecovery(async()=>{
  const initialQuery=await search(target);
  if(/총 물건수\s*0건/.test(initialQuery)){
   await saveRun({schemaVersion:1,court,pageSize:40,pages:[{court,page:1,displayedTotal:0,rows:[],observedAt:new Date().toISOString(),sourceUrl:page.url()}],details:{},detailJobs:[],errors:[],pagination:{startPage:1,lastPage:1,reachedLastPage:true,nextPage:null}});
   checkpoint.courts[target.id]={nextPage:1,complete:true,total:0,checkedAt:new Date().toISOString()};await atomic(checkpointPath,checkpoint);return;
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
  for(let number=Math.max(startPage,checkpoint.courts[target.id]?.nextPage??1);number<=lastPage;number++){
   if(stop)return 'stop';
   try{await readFile(`${root}/STOP`);stop=true;return 'stop';}catch(e){if(e.code!=='ENOENT')throw e;}
   await goPage(number);
   let observedRows=await stableRows();
   let snapshot={court,page:number,displayedTotal:total,rows:observedRows,observedAt:new Date().toISOString(),sourceUrl:page.url()};
   // A half-drawn table once stopped a whole run ("Unrecognized identity at row 24"): read the page
   // again after a pause; a layout that still fails stops the run and is kept for fixing the parser.
   let items;
   try{items=parseList(snapshot);}
   catch(first){
    await atomic(`${root}/last-bad-page.json`,{error:first.message,...snapshot});
    await page.waitForTimeout(5000);await goPage(number);observedRows=await stableRows();
    snapshot={...snapshot,rows:observedRows,observedAt:new Date().toISOString()};
    // Still unreadable: record the page and go on with the rest; the run reports it at the end.
    try{items=parseList(snapshot);}
    catch(second){
     progress.badPages=(progress.badPages??0)+1;
     await appendFile(`${root}/odd-rows.jsonl`,JSON.stringify({at:new Date().toISOString(),court,page:number,error:second.message})+'\n');
     await atomic(`${root}/last-bad-page.json`,{error:second.message,...snapshot});
     continue;
    }
   }
   // Rows the parser didn't recognise were skipped; keep them for review.
   if(items.problems?.length){
    progress.oddRows=(progress.oddRows??0)+items.problems.length;
    for(const p of items.problems)await appendFile(`${root}/odd-rows.jsonl`,JSON.stringify({at:new Date().toISOString(),court,page:number,...p})+'\n');
    await atomic(`${root}/last-bad-page.json`,{error:items.problems.map(p=>p.reason).join(','),...snapshot});
   }
   const base={schemaVersion:1,court,pageSize:40,pages:[snapshot],details:{},detailJobs:[],errors:[],pagination:{startPage:number,reachedLastPage:false,nextPage:number+1}};
   await saveRun(base);
   let state=await load('data/court/current.json',{});
   // The official list mixes every type, so it is still read in full; only apartments go further.
   const eligible=items.filter(item=>item.assetCategory==='real-estate'&&inSeoulGyeonggi(item)&&(isApartmentUse(item.use)||hiddenKeys.has(item.key)));
   for(const item of items)if(inSeoulGyeonggi(item)&&!isApartmentUse(item.use)&&!hiddenKeys.has(item.key)){const use=item.use??'미상';progress.excludedByUse[use]=(progress.excludedByUse[use]??0)+1;}
   for(const item of eligible)seen.add(item.key);
   for(const item of eligible){
    if(!needsCourtDetail(state.items[item.key],checks[item.key])){progress.skipped++;continue;}
    try{await readFile(`${root}/STOP`);stop=true;}catch(e){if(e.code!=='ENOENT')throw e;}
    if(progress.attempted>=limit||stop)return 'stop';
    const began=Date.now();progress.attempted++;progress.current={court,page:number,key:item.key};
    let detailSaved=false;
    try{
     const raw=await deadline(async()=>{
     await guard();
     const index=observedRows.findIndex(c=>c.length===8&&c[1].text.match(/\d{4}타경\d+/)?.[0]===item.caseNumber&&Number(c[2].text.trim())===item.itemNumber);
     if(index<0)throw Error('Item absent from validated list');
     await table().locator('tbody tr:visible').nth(index).getByRole('link',{name:observedRows[index][3].links[0].trim(),exact:true}).click();
     await page.waitForFunction(({caseNumber,itemNumber})=>{
      const text=Array.from(document.querySelectorAll('table')).filter(e=>e.getClientRects().length).map(e=>e.innerText).join('\n\n');
      return text.match(/사건번호\s*(\d{4}타경\d+)/)?.[1]===caseNumber&&text.replace(/\s/g,'').includes(`물건번호${itemNumber}물건종류`);
     },item,{timeout:20000});
     await guard();
     return page.locator('table:visible').evaluateAll(es=>es.map(e=>e.innerText).join('\n\n'));
     },'detail');
     parseDetail(raw,item);
     const stamp=new Date().toISOString();
     const run={...base,pages:[{...snapshot,observedAt:stamp}],details:{[item.key]:raw},detailJobs:[{key:item.key,page:number,state:'succeeded',attempts:1}]};
     await saveRun(run);detailSaved=true;
     progress.succeeded++;consecutiveFailures=0;
     progress.timings.push({key:item.key,ms:Date.now()-began});
     await record({stage:'saved',key:item.key,ms:Date.now()-began,detail:true});
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
   checkpoint.courts[target.id]={nextPage:number+1,complete:number===lastPage,total,checkedAt:new Date().toISOString()};
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
  }catch(error){
   // Retries used up on one court: note it and go on with the next court (2026-11-11 a stuck 고양지원
   // ended the run and nine courts went unchecked). Access refusals still stop everything.
   if(blocked||/denied access|access challenge|lock exists/i.test(error.message))throw error;
   progress.failedCourts=[...(progress.failedCourts??[]),{court:target.id,message:error.message}];
   await record({stage:'court-failed',court:target.id,message:error.message});
   await page.context().close().catch(()=>{});page=await createPage();consecutiveFailures=0;progress.status='running';
   continue;
  }
  if(outcome==='stop')break outer;
 }
 progress.status=stop?'stopped':progress.attempted>=limit?'limit-reached':(progress.failed||progress.oddRows||progress.badPages||progress.failedCourts?.length)?'pass-finished-with-errors':'pass-finished';
 if(progress.failedCourts?.length){progress.error=`법원 ${progress.failedCourts.length}곳 실패: ${progress.failedCourts.map(c=>c.court).join(', ')} (${progress.failedCourts[0].message.split('\n')[0]})`;process.exitCode=1;}
 if(syncEvery&&(repairPass||progress.succeeded%syncEvery!==0))await sync();
 if(repairPass){
  const ledger=await load('data/court/current.json',{});
  const audit=repairAudit({...ledger,items:Object.fromEntries(Object.entries(ledger.items??{}).filter(([,item])=>isApartmentUse(item.use)))},{media:await load('data/court/media/manifest.json',[]),checks,seen:[...seen],courts,completedCourts:Object.entries(checkpoint.courts).filter(([,v])=>v.complete).map(([k])=>k),run:progress.id,startedAt:progress.startedAt,finishedAt:new Date().toISOString()});
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
