// Daily result check for court items whose 매각기일 has passed: the official 매각결과검색 lists
// results for 7 days after the sale, so each capital-area court with past-date items is read
// once a day and matching rows (매각/유찰) are stored as resultEvidence. Same identity and
// date guards as results.mjs; a result older than the item's current sale date is ignored.
//   node scripts/court/past-results.mjs [--days=7]
import {chromium} from 'playwright-core';
import {readFile,writeFile,appendFile,open,unlink,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {replaceFile} from './store.mjs';
import {parseResults} from './results.mjs';
import {selectTargetResults} from './results-repair-core.mjs';
import {inCapitalArea} from './scope.mjs';

const root='data/court/standalone';
const days=Number(process.argv.find(x=>x.startsWith('--days='))?.slice(7)??7);
const load=async(p,f)=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return f;}};
const atomic=async(p,v)=>{const t=`${p}.${randomUUID()}.tmp`;await writeFile(t,JSON.stringify(v,null,2),{flush:true});await replaceFile(t,p);};
const stopped=async()=>{try{await readFile(`${root}/STOP`);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};
const kst=offsetDays=>new Date(Date.now()+9*3600e3-offsetDays*864e5).toISOString().slice(0,10);
if(await stopped()){console.log(JSON.stringify({stage:'finish',status:'stopped'}));process.exit(0);}

// Items whose sale date passed within the window and have no result for that date yet.
function pastDueKeys(state,courts,today,from){
 const allowed=new Set(courts);
 return Object.entries(state.items).filter(([,i])=>allowed.has(i.court)&&inCapitalArea(i)&&i.auctionDate&&i.auctionDate<today&&i.auctionDate>=from
  &&!(i.resultEvidence&&i.resultEvidence.auctionDate>=i.auctionDate)).map(([k])=>k);
}

const courts=JSON.parse(await readFile('scripts/court/courts.json','utf8')).slice(0,16);
let state=await load('data/court/current.json',null);if(!state)throw Error('Court state missing');
const targets=new Set(pastDueKeys(state,courts,kst(0),kst(days)));
const runCourts=courts.filter(c=>[...targets].some(k=>k.startsWith(`${c}:`)));
const progress={id:randomUUID(),pid:process.pid,mode:'past-results',status:'starting',startedAt:new Date().toISOString(),targets:targets.size,courts:runCourts.length,pages:0,matched:0,sold:0,failedBids:0,errors:[]};
const record=async e=>{await appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),run:progress.id,...e})+'\n');};
if(!targets.size){console.log(JSON.stringify({stage:'finish',status:'nothing-due',targets:0}));process.exit(0);}

const lock=await open(`${root}/running.lock`,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,mode:'past-results',startedAt:progress.startedAt}));
let browser,page,blocked=false,pending=new Set(),lastNetwork=0;
const guard=async()=>{if(blocked||/비정상적인 접근|자동입력 방지문자|접속이 차단|요청 횟수.*초과/.test(await page.locator('body').innerText()))throw Error('Official access refused; no bypass');};
const table=()=>page.locator('table[summary="매각결과검색 목록"]:visible');
const rows=()=>table().locator('tbody tr:visible').evaluateAll(es=>es.map(e=>[...e.cells].map(c=>c.innerText)));
const stable=async()=>{await table().waitFor();let last='',same=0;for(let n=0;n<100;n++){await guard();await delay(200);const value=JSON.stringify(await rows());same=value===last?same+1:0;last=value;if(same>=3&&pending.size===0&&Date.now()-lastNetwork>=800)return JSON.parse(value);}throw Error('Official result rows did not stabilize');};
const goPage=async number=>{for(let n=0;n<100;n++){await guard();const button=page.getByRole('button',{name:String(number),exact:true});if(await button.count()){if(await button.getAttribute('title')!=='선택됨'){await button.click();await page.waitForFunction(number=>[...document.querySelectorAll('[title="선택됨"]')].some(e=>e.textContent.trim()===String(number)),number,{timeout:20000});}await stable();return;}const numbers=await page.getByRole('button').evaluateAll(es=>es.map(e=>e.innerText.trim()).filter(x=>/^\d+$/.test(x)).map(Number));await page.getByRole('button',{name:number<Math.min(...numbers)?'이전 목록':'다음 목록',exact:true}).click();await delay(400);}throw Error('Result pagination limit');};
const queryTable=()=>page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true});

try{
 await mkdir(`${root}/past-result-proofs`,{recursive:true});
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({locale:'ko-KR'});page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(45000);
 page.on('response',r=>{if(new URL(r.url()).hostname==='www.courtauction.go.kr'&&[403,429].includes(r.status()))blocked=true;});
 page.on('dialog',async d=>{if(/차단|비정상|자동입력|보안문자|접속.*제한/.test(d.message()))blocked=true;await d.dismiss();});
 page.on('request',r=>{if(new URL(r.url()).hostname==='www.courtauction.go.kr'&&['fetch','xhr','document'].includes(r.resourceType())&&!r.url().includes('selectRletYrDspslStats')){pending.add(r);lastNetwork=Date.now();}});
 const finished=r=>{if(pending.delete(r))lastNetwork=Date.now();};page.on('requestfinished',finished);page.on('requestfailed',finished);
 progress.status='running';await record({stage:'past-results-start',targets:targets.size,courts:runCourts});
 for(const court of runCourts){
  if(await stopped()){progress.status='stopped';break;}
  await page.goto('https://www.courtauction.go.kr/pgj/index.on',{waitUntil:'domcontentloaded'});
  await page.getByRole('dialog').last().waitFor({timeout:4000}).catch(()=>{});
  for(let notice=0;notice<6&&await page.getByRole('dialog').count();notice++){const dialog=page.getByRole('dialog').last();const text=await dialog.innerText();if(!text.startsWith('공지사항')||/차단|비정상|자동입력|보안문자/.test(text))throw Error('Unrecognized or access-control dialog; not dismissed');const close=dialog.getByTitle('공지사항 팝업창 닫기 버튼',{exact:true});if(await close.count()!==1)throw Error('Notice close control unavailable');await close.click();await delay(300);}
  await guard();await page.getByRole('link',{name:'매각결과검색',exact:true}).first().click();
  await page.waitForFunction(()=>document.querySelector('#mf_wfm_mainFrame_sbx_dspslRsltSrchCortOfc')?.options.length>10);
  await page.locator('#mf_wfm_mainFrame_sbx_dspslRsltSrchCortOfc').selectOption(court);await page.locator('#mf_wfm_mainFrame_btn_dspslRsltSrch').click();
  await queryTable().waitFor();await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});await guard();
  const query=await queryTable().innerText();if(!query.includes(court))throw Error('Result court query mismatch');
  const total=Number(query.match(/총 물건수\s*([\d,]+)/)?.[1]?.replaceAll(',',''));if(!Number.isInteger(total)||total<0)throw Error('Missing official result count');
  if(!total){await record({stage:'past-results-court',court,total:0});continue;}
  await page.locator('#mf_wfm_mainFrame_sbx_pageSize').selectOption('40');await stable();
  const lastPage=Math.ceil(total/40);
  for(let number=1;number<=lastPage;number++){
   if(await stopped()){progress.status='stopped';break;}
   await goPage(number);const raw=await stable();
   const chosen=selectTargetResults(raw,court,targets),stamp=new Date().toISOString();
   const payload={kind:'court-results',court,query,rows:chosen.rows,sourceUrl:page.url(),observedAt:stamp};
   const proofs=parseResults(payload);
   if(proofs.length)await atomic(`${root}/past-result-proofs/${progress.id}-${runCourts.indexOf(court)}-${number}.json`,{...payload,unsupported:chosen.unsupported,total,page:number});
   for(const proof of proofs){
    const item=state.items[`${court}:${proof.caseNumber}:${proof.itemNumber}`];
    if(!item||(item.auctionDate&&item.auctionDate>proof.auctionDate)||item.resultEvidence?.observedAt>stamp)continue;
    item.resultEvidence=proof;progress.matched++;if(proof.result==='매각')progress.sold++;else progress.failedBids++;
   }
   progress.pages++;await delay(700);
  }
  await atomic('data/court/current.json',state);
  await record({stage:'past-results-court',court,total,matched:progress.matched});
 }
 if(progress.status==='running')progress.status='pass-finished';
}catch(e){progress.status='blocked';progress.errors.push(e.message);process.exitCode=1;}
finally{
 progress.finishedAt=new Date().toISOString();
 await atomic(`${root}/past-results-last.json`,progress);
 await browser?.close();await lock.close();await unlink(`${root}/running.lock`).catch(()=>{});
 console.log(JSON.stringify({stage:'finish',status:progress.status,targets:progress.targets,matched:progress.matched,sold:progress.sold,failedBids:progress.failedBids,pages:progress.pages,error:progress.errors[0]}));
}
