// One-off follow-up of the repair audit, using only public official search UI.
import {chromium} from 'playwright-core';
import {readFile,writeFile,open,unlink,appendFile,mkdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {caseEvidence,applyCaseEvidence} from './case-repair-core.mjs';
import {replaceFile} from './store.mjs';
import {saveMedia} from './media.mjs';
import {recheckOptions} from './recheck-options.mjs';
const root='data/court/standalone';
const load=async(p,f)=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return f;}};
const atomic=async(p,v)=>{const t=`${p}.${randomUUID()}.tmp`;await writeFile(t,JSON.stringify(v,null,2));await replaceFile(t,p);};
const stopped=async()=>{try{await readFile(`${root}/STOP`);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};
if(await stopped())throw Error('User STOP exists');
const limit=Number(process.argv.find(x=>x.startsWith('--limit='))?.split('=')[1]??100000);
if(!Number.isInteger(limit)||limit<1)throw Error('Invalid limit');
const courts=JSON.parse(await readFile('scripts/court/courts.json','utf8')).slice(0,16);
const audit=await load(`${root}/repair-audit.json`,null);
if(!audit?.allCourtsTraversed)throw Error('Complete list comparison required before case follow-up');
let state=await load('data/court/current.json',null);
const options=await recheckOptions(process.argv,state,audit,courts,'case-repair');
const targets=options.targets;
const previous=await load(`${root}/${options.prefix}-results.json`,{auditRun:audit.run,items:{}});
if(previous.auditRun!==audit.run)throw Error('Different repair audit requires a separate result file');
const results=previous;
const groups=new Map();
for(const item of targets){if(results.items[item.key]&&!/을\(를\)/.test(JSON.stringify([results.items[item.key].evidence?.caseOutcome,results.items[item.key].evidence?.latestResult])))continue;const match=item.caseNumber.match(/^(\d{4})타경(\d{1,7})$/);if(!match){results.items[item.key]={state:'invalid-identifier',key:item.key,observedAt:new Date().toISOString()};continue;}const key=`${item.court}:${item.caseNumber}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
const lock=await open(`${root}/running.lock`,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),mode:'case-repair'}));
const progress={id:randomUUID(),pid:process.pid,mode:'case-repair',status:'starting',scope:'seoul-gyeonggi',startedAt:new Date().toISOString(),limit,attempted:0,succeeded:0,failed:0,photos:0,verified:0,unavailable:0,skipped:targets.length-[...groups.values()].flat().length,errors:[],timings:[]};
const record=async(event)=>{await appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),run:progress.id,...event})+'\n');await atomic(`${root}/progress.json`,progress);console.log(JSON.stringify(event));};
const lastPipeline=await load('data/court/pipeline/latest.json',{});
let browser,page,blocked=false,dirty=targets.some(x=>Date.parse(x.caseSearchEvidence?.observedAt??0)>Date.parse(lastPipeline.finishedAt??0));
const guard=async()=>{if(blocked)throw Error('Official access denied; no bypass');const body=await page.locator('body').innerText();if(/비정상적인 접근|자동입력 방지문자|접속이 차단|요청 횟수.*초과/.test(body))throw Error('Official access challenge; no bypass');};
const sync=async()=>{progress.syncStatus='running';await record({stage:'sync-start'});const log=await open(`${root}/pipeline.log`,'a');try{const syncStarted=Date.now();const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/court/pipeline.mjs'],{stdio:['ignore',log.fd,log.fd],windowsHide:true});child.on('error',reject);child.on('exit',resolve);});const report=await load('data/court/pipeline/latest.json',{});const errors=(report.errors??[]).filter(e=>e.stage!=='matching');progress.syncStatus=!report.finishedAt||Date.parse(report.finishedAt)<syncStarted||errors.length||![0,1].includes(code)?'failed':'completed';progress.lastSyncAt=new Date().toISOString();await record({stage:'sync-finish',status:progress.syncStatus,databaseErrors:errors.length,matchingDeferred:(report.errors??[]).filter(e=>e.stage==='matching').length,exitCode:code});if(progress.syncStatus==='failed')throw Error('Court DB synchronization failed');dirty=false;}finally{await log.close();}};
const searchCase=async(first)=>{
  await page.goto('https://www.courtauction.go.kr/pgj/index.on',{waitUntil:'domcontentloaded'});await page.getByRole('dialog').last().waitFor({timeout:4000}).catch(()=>{});
  for(let notice=0;notice<6&&await page.getByRole('dialog').count();notice++){const dialog=page.getByRole('dialog').last();const text=await dialog.innerText();if(!text.startsWith('공지사항')||/차단|비정상|자동입력|보안문자/.test(text))throw Error('Unrecognized or access-control dialog');const close=dialog.getByTitle('공지사항 팝업창 닫기 버튼',{exact:true});if(await close.count()!==1)throw Error('Notice close control unavailable');await close.click();await delay(300);}await guard();
  await page.getByRole('link',{name:'경매사건검색',exact:true}).first().click();
  const select=page.locator('#mf_wfm_mainFrame_sbx_auctnCsSrchCortOfc');
  await page.waitForFunction(()=>document.querySelector('#mf_wfm_mainFrame_sbx_auctnCsSrchCortOfc')?.options.length>10,null,{timeout:20000});
  const options=await select.locator('option').evaluateAll(es=>es.map(e=>({label:e.textContent.trim(),value:e.value})));
  const chosen=options.find(x=>x.label===first.court)??options.find(x=>x.label.endsWith(first.court));
  if(!chosen)throw Error(`Official court option unavailable: ${first.court}`);
  await select.selectOption(chosen.value);
  const [,year,number]=first.caseNumber.match(/^(\d{4})타경(\d{1,7})$/);
  await page.locator('#mf_wfm_mainFrame_sbx_auctnCsSrchCsYear').selectOption(year);
  await page.locator('#mf_wfm_mainFrame_ibx_auctnCsSrchCsNo').fill(number);
  await page.locator('#mf_wfm_mainFrame_btn_auctnCsSrchBtn').click();
  await page.waitForFunction(expected=>Array.from(document.querySelectorAll('table[summary="사건 기본 내역 검색결과"]')).some(t=>t.getClientRects().length&&t.innerText.match(/사건번호\s*(\d{4}타경\d+)/)?.[1]===expected),first.caseNumber,{timeout:25000});
  await delay(800);await guard();
  const queryRaw=await page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
  const basicRaw=await page.locator('table[summary="사건 기본 내역 검색결과"]:visible').innerText();
  const propertyTables=await page.locator('table[summary="물건내역"]:visible').all();
  const available=new Map();
  for(const table of propertyTables){const raw=await table.innerText();const itemNumber=Number(raw.match(/물건번호\s*(\d+)/)?.[1]);if(!itemNumber||available.has(itemNumber))throw Error('Ambiguous case property table');available.set(itemNumber,{raw,table});}
  return {queryRaw,basicRaw,available};
};
try{
 await mkdir(`${root}/${options.prefix}-proofs`,{recursive:true});await atomic(`${root}/${options.prefix}-results.json`,results);
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({locale:'ko-KR'});page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(45000);
 page.on('response',r=>{if(new URL(r.url()).hostname==='www.courtauction.go.kr'&&[403,429].includes(r.status()))blocked=true;});
 page.on('dialog',async d=>{progress.lastDialog=d.message();if(/차단|비정상|자동입력|보안문자|접속.*제한/.test(d.message()))blocked=true;await d.dismiss();});
 progress.status='running';await record({stage:'case-repair-start',pendingCases:groups.size,targetItems:targets.length});
 outer:for(const items of groups.values()){
  if(await stopped()){progress.status='stopped';break;}
  if(progress.attempted>=limit)break;
  const first=items[0];progress.current={court:first.court,key:first.key,caseNumber:first.caseNumber};await record({stage:'case-search-start',court:first.court,caseNumber:first.caseNumber});
  let {queryRaw,basicRaw,available}=await searchCase(first);let reload=false;
  // Finish and checkpoint each property before navigating away from this case.
  for(const item of items){
   if(progress.attempted>=limit)break outer;
   if(await stopped()){progress.status='stopped';break outer;}
   if(reload){({queryRaw,basicRaw,available}=await searchCase(item));reload=false;}
   progress.attempted++;progress.current={court:item.court,key:item.key,caseNumber:item.caseNumber};
   const found=available.get(item.itemNumber);const button=found?.table.getByRole('button',{name:'물건상세조회',exact:true});
   const enabled=!!button&&await button.count()===1&&await button.isEnabled();
   const stamp=new Date().toISOString();
   const evidence=caseEvidence(item,{queryRaw,basicRaw,propertyRaw:found?.raw??'',sourceUrl:page.url(),observedAt:stamp,detailAvailable:enabled});
   let detailRaw=null,photoCount=0;
   state=applyCaseEvidence(state,item.key,evidence);await atomic('data/court/current.json',state);dirty=true;
   const media=await load('data/court/media/manifest.json',[]);
   const needsDetail=!state.items[item.key].detail||!media.some(x=>x.key===item.key);
   if(enabled&&needsDetail){
    await button.click();await page.waitForFunction(({caseNumber,itemNumber})=>{const text=Array.from(document.querySelectorAll('table')).filter(e=>e.getClientRects().length).map(e=>e.innerText).join('\n\n');return text.match(/사건번호\s*(\d{4}타경\d+)/)?.[1]===caseNumber&&text.replace(/\s/g,'').includes(`물건번호${itemNumber}물건종류`);},item,{timeout:20000});await guard();
    detailRaw=await page.locator('table:visible').evaluateAll(es=>es.map(e=>e.innerText).join('\n\n'));
    state=applyCaseEvidence(state,item.key,evidence,detailRaw);await atomic('data/court/current.json',state);dirty=true;progress.succeeded++;
    await delay(500);const photos=await page.locator('img:visible').evaluateAll(es=>es.filter(e=>/^(전경도|관련사진)_\d+$/.test(e.alt)&&e.src.startsWith('data:image/')&&e.complete&&e.naturalWidth>0).slice(0,1).map(e=>({alt:e.alt,dataUrl:e.src})));
    if(photos.length&&!media.some(x=>x.key===item.key)){const saved=await saveMedia({key:item.key,court:item.court,caseNumber:item.caseNumber,itemNumber:item.itemNumber,sourceUrl:page.url(),observedAt:stamp,detailRaw,photos});photoCount=saved.photos;progress.photos+=photoCount;}
    reload=true;
   }
   progress.verified++;if(!enabled&&needsDetail)progress.unavailable++;
   const result={state:detailRaw?'detail-saved':!found?'property-not-provided':!enabled?'detail-disabled':'status-verified',key:item.key,evidence,photos:photoCount};
   await atomic(`${root}/${options.prefix}-proofs/${Buffer.from(item.key).toString('base64url')}.json`,result);
   results.items[item.key]=result;await atomic(`${root}/${options.prefix}-results.json`,results);
   await record({stage:'case-verified',key:item.key,state:result.state,caseOutcome:evidence.caseOutcome,latestResult:evidence.latestResult,detail:!!detailRaw,photos:photoCount});
   if(dirty&&progress.verified%50===0)await sync();
   await delay(700);
  }
 }
 if(dirty)await sync();
 if(progress.status!=='stopped')progress.status=progress.attempted>=limit?'limit-reached':'pass-finished';
 const counts={targets:targets.length,verified:Object.values(results.items).filter(x=>x.evidence).length,invalidIdentifiers:Object.values(results.items).filter(x=>x.state==='invalid-identifier').length,detailSaved:targets.filter(x=>state.items[x.key].caseSearchEvidence&&state.items[x.key].detail).length,detailDisabled:Object.values(results.items).filter(x=>x.state==='detail-disabled').length,propertyNotProvided:Object.values(results.items).filter(x=>x.state==='property-not-provided').length,pending:targets.filter(x=>!results.items[x.key]).length};
 await atomic(`${root}/${options.prefix}-audit.json`,{auditRun:audit.run,checkedAt:new Date().toISOString(),counts,collectionComplete:false,reason:'공식 사건 검색에서 제공하지 않는 상세·사진은 미확보로 유지합니다. 미관측을 매각 등으로 추정하지 않습니다.'});
}catch(error){progress.status='blocked';progress.failed++;progress.error=error.message;progress.errors.push({key:progress.current?.key,message:error.message});process.exitCode=1;}
finally{progress.finishedAt=new Date().toISOString();await record({stage:'finish',status:progress.status,verified:progress.verified,succeeded:progress.succeeded,unavailable:progress.unavailable,error:progress.error});await atomic(`${root}/run-${progress.id}.json`,progress);await browser?.close();await lock.close();await unlink(`${root}/running.lock`);}
