// One-day experiment (user-requested 2026-10-30): would a second browser beside the daily court
// collector draw any warning from the court site? This browser only reads — it never writes the
// collector's state — and follows the collector's own pacing on a heavy day (~4 detail opens per
// 40-row page), walking the courts in reverse so the two never sit on the same court.
// Any warning on either side (403/429, a challenge page or dialog, an error, a collector retry)
// creates data/court/standalone/STOP, which halts the collector and later court runs until a person
// checks and removes it. Waits for the collector to start and ends when it finishes.
//   node scripts/court/parallel-test.mjs
import { chromium } from 'playwright-core';
import { mkdir, readFile, writeFile, appendFile, stat } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { parseList, COURT_URL } from './core.mjs';
import { inSeoulGyeonggi } from './scope.mjs';
import { sendWindowsNotification } from './windows-notify.mjs';

const root='data/court/parallel-test',collector='data/court/standalone';
await mkdir(root,{recursive:true});
const DETAILS_PER_PAGE=4;
const log=async event=>{const line=JSON.stringify({at:new Date().toISOString(),...event});await appendFile(`${root}/events.jsonl`,line+'\n');console.log(line);};
const readJson=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch{return fallback;}};
const exists=path=>stat(path).then(()=>true,()=>false);
const kstMinutes=()=>{const [h,m]=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date()).split(':').map(Number);return h*60+m;};

async function haltAll(reason){
 await writeFile(`${collector}/STOP`,`parallel-test ${new Date().toISOString()}\n${reason}\n`);
 await log({stage:'halt',reason});
 await sendWindowsNotification({title:'선경매 · 법원 2개 테스트 중지',message:`${reason}\n법원 수집도 멈췄습니다(STOP). 확인 후 STOP 파일을 지워야 다시 수집합니다.`}).catch(()=>{});
}

// 1) Wait for today's collector run (the court job chains after Onbid; 15:00 is its fallback).
const startedAt=new Date().toISOString();
await log({stage:'waiting'});
let main;
for(;;){
 if(await exists(`${collector}/STOP`)){await log({stage:'skip',reason:'STOP file already present'});process.exit(0);}
 const progress=await readJson(`${collector}/progress.json`,{});
 if(await exists(`${collector}/running.lock`)&&progress.startedAt>startedAt&&progress.status==='running'){main=progress;break;}
 if(kstMinutes()>17*60){await log({stage:'skip',reason:'collector did not start by 17:00'});process.exit(0);}
 await delay(30_000);
}
await log({stage:'collector-started',run:main.id,failed:main.failed});

// The collector's state as seen from here: finished, warned, or still fine.
async function collectorState(){
 const p=await readJson(`${collector}/progress.json`,{});
 if(p.id!==main.id||!['running','recovering'].includes(p.status))return {done:true,status:p.status};
 if(p.status==='recovering')return {warning:`수집기 재시도 대기: ${p.recovery?.message??''}`.slice(0,200)};
 if((p.failed??0)>(main.failed??0))return {warning:`수집기 물건 실패: ${p.errors?.at(-1)?.message??''}`.slice(0,200)};
 return {};
}

const stats={pages:0,details:0,itemMs:[],pageMs:[],statuses:{}};
const browser=await chromium.launch({channel:'msedge',headless:true});
let warning=null,pendingRequests=new Set(),lastNetworkActivity=Date.now();
const page=await browser.newPage({locale:'ko-KR'});
page.setDefaultTimeout(15000);
const relevant=request=>new URL(request.url()).hostname==='www.courtauction.go.kr'&&['xhr','fetch','document'].includes(request.resourceType())&&!new URL(request.url()).pathname.endsWith('/pgj111/selectRletYrDspslStats.on');
page.on('request',request=>{if(relevant(request)){pendingRequests.add(request);lastNetworkActivity=Date.now();}});
const finished=request=>{if(pendingRequests.delete(request))lastNetworkActivity=Date.now();};
page.on('requestfinished',finished);page.on('requestfailed',finished);
page.on('response',response=>{if(new URL(response.url()).hostname!=='www.courtauction.go.kr')return;const s=response.status();stats.statuses[s]=(stats.statuses[s]??0)+1;if([403,429].includes(s))warning??=`법원 사이트 응답 ${s}`;});
page.on('dialog',async dialog=>{await log({stage:'dialog',message:dialog.message()});warning??=`법원 사이트 알림창: ${dialog.message()}`.slice(0,200);await dialog.dismiss();});
const guard=async()=>{
 if(warning)throw Error(warning);
 const text=await page.locator('body').innerText();
 if(/비정상적인 접근|자동입력 방지문자|접속이 차단|요청 횟수.*초과/.test(text))throw Error(warning='법원 사이트 접근 제한 안내');
};
const table=()=>page.getByRole('table',{name:'물건번호,소재지 및 내역,비고,용도 을(를) 나타낸 표',exact:true});
const rows=()=>table().locator('tbody tr:visible').evaluateAll(es=>es.map(row=>Array.from(row.querySelectorAll('td')).map(c=>({text:c.innerText,rowSpan:c.rowSpan,links:Array.from(c.querySelectorAll('a')).map(a=>a.innerText)}))));
const stableRows=async()=>{
 await table().waitFor({state:'visible'});
 await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
 let previous=JSON.stringify(await rows()),same=0;
 for(let n=0;n<100;n++){await delay(200);const next=JSON.stringify(await rows());same=next===previous?same+1:0;if(same>=3&&pendingRequests.size===0&&Date.now()-lastNetworkActivity>=800&&JSON.parse(next).some(c=>c.length===8))return JSON.parse(next);previous=next;}
 throw Error('List failed to stabilize');
};
const goPage=async number=>{
 await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
 for(let n=0;n<100;n++){
  await guard();
  if(await page.getByRole('button',{name:String(number),exact:true}).count()){const target=page.getByRole('button',{name:String(number),exact:true});if(await target.getAttribute('title')==='선택됨')return;await target.click();await page.waitForFunction(number=>Array.from(document.querySelectorAll('[title="선택됨"]')).some(e=>e.textContent.trim()===String(number)),number,{timeout:15000});await stableRows();return;}
  const numbers=await page.getByRole('button').evaluateAll(es=>es.filter(e=>/^\d+$/.test(e.innerText.trim())).map(e=>Number(e.innerText.trim())));
  await page.getByRole('button',{name:number<Math.min(...numbers)?'이전 목록':'다음 목록',exact:true}).click();await delay(350);
 }throw Error('Pagination limit');
};

// 2) Walk courts in reverse, opening a few details per page, until the collector finishes.
let outcome='collector-finished';
try{
 const courts=JSON.parse(await readFile('scripts/court/courts.json','utf8')).slice(0,16).reverse();
 outer:for(;;)for(const court of courts){
  await page.goto(COURT_URL,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('#mf_sbx_rletRpdtCortLst').selectOption({label:court});
  await page.getByRole('button',{name:'검색하기',exact:true}).click();
  await table().waitFor({timeout:20000});await guard();
  await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});
  const query=await page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
  if(/총 물건수\s*0건/.test(query))continue;
  await page.getByRole('combobox',{name:'페이지당 수 선택',exact:true}).selectOption('40');
  await stableRows();
  const total=Number(query.match(/총 물건수\s*([\d,]+)건/)?.[1]?.replaceAll(',',''));
  const lastPage=Math.ceil(total/40);
  await log({stage:'court',court,total,lastPage});
  for(let number=1;number<=lastPage;number++){
   const state=await collectorState();
   if(state.done){outcome=`collector-${state.status}`;break outer;}
   if(state.warning)throw Error(state.warning);
   if(await exists(`${collector}/STOP`)){outcome='stop-file';break outer;}
   const pageStarted=Date.now();
   await goPage(number);
   const observedRows=await stableRows();
   // A half-drawn table is a parser matter, not a site warning: skip that page's details.
   let items=[];
   try{items=parseList({court,page:number,displayedTotal:total,rows:observedRows,observedAt:new Date().toISOString(),sourceUrl:page.url()});}catch(error){await log({stage:'unparsed-page',court,page:number,message:error.message});}
   items=items.filter(item=>item.assetCategory==='real-estate'&&inSeoulGyeonggi(item)).slice(0,DETAILS_PER_PAGE);
   for(const item of items){
    const began=Date.now();
    await guard();
    const index=observedRows.findIndex(c=>c.length===8&&c[1].text.match(/\d{4}타경\d+/)?.[0]===item.caseNumber&&Number(c[2].text.trim())===item.itemNumber);
    if(index<0)continue;
    await table().locator('tbody tr:visible').nth(index).getByRole('link',{name:observedRows[index][3].links[0].trim(),exact:true}).click();
    await page.waitForFunction(({caseNumber,itemNumber})=>{
     const text=Array.from(document.querySelectorAll('table')).filter(e=>e.getClientRects().length).map(e=>e.innerText).join('\n\n');
     return text.match(/사건번호\s*(\d{4}타경\d+)/)?.[1]===caseNumber&&text.replace(/\s/g,'').includes(`물건번호${itemNumber}물건종류`);
    },item,{timeout:20000});
    await guard();
    await delay(500);
    stats.details++;stats.itemMs.push(Date.now()-began);
    if(!await table().isVisible())await page.getByRole('button',{name:'이전',exact:true}).last().click();
    await goPage(number);await stableRows();
    await delay(500);
   }
   stats.pages++;stats.pageMs.push(Date.now()-pageStarted);
   if(stats.pages%10===0)await log({stage:'progress',court,page:number,pages:stats.pages,details:stats.details,statuses:stats.statuses});
  }
 }
}catch(error){
 outcome='warning';
 await haltAll(warning??error.message);
}finally{
 await browser.close().catch(()=>{});
 const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[s.length>>1]:null;};
 const summary={stage:'finish',outcome,startedAt,finishedAt:new Date().toISOString(),collectorRun:main.id,pages:stats.pages,details:stats.details,medianItemMs:median(stats.itemMs),medianPageMs:median(stats.pageMs),statuses:stats.statuses};
 await writeFile(`${root}/summary.json`,JSON.stringify(summary,null,2));
 await log(summary);
}
