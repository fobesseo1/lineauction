// One-off official recent result comparison, restricted to the existing repair audit.
import{chromium}from'playwright-core';
import{readFile,writeFile,appendFile,open,unlink,mkdir}from'node:fs/promises';
import{randomUUID}from'node:crypto';import{spawn}from'node:child_process';import{setTimeout as delay}from'node:timers/promises';
import{replaceFile}from'./store.mjs';import{parseResults}from'./results.mjs';import{selectTargetResults}from'./results-repair-core.mjs';
import{recheckOptions}from'./recheck-options.mjs';
const root='data/court/standalone';
const load=async(p,f)=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;return f;}};
const atomic=async(p,v)=>{const t=`${p}.${randomUUID()}.tmp`;await writeFile(t,JSON.stringify(v,null,2));await replaceFile(t,p);};
const stopped=async()=>{try{await readFile(`${root}/STOP`);return true;}catch(e){if(e.code!=='ENOENT')throw e;return false;}};
if(await stopped())throw Error('User STOP exists');
const courts=JSON.parse(await readFile('scripts/court/courts.json','utf8')).slice(0,16);
const selected=process.argv.find(x=>x.startsWith('--court='))?.slice(8);if(selected&&!courts.includes(selected))throw Error('Court outside approved scope');
const maxPages=Number(process.argv.find(x=>x.startsWith('--pages='))?.slice(8)??100000);if(!Number.isInteger(maxPages)||maxPages<1)throw Error('Invalid page limit');
const audit=await load(`${root}/repair-audit.json`,null);const cases=await load(`${root}/case-repair-results.json`,null);let state=await load('data/court/current.json',null);
if(!audit?.allCourtsTraversed||cases?.auditRun!==audit.run)throw Error('Matching source audit required');
const options=await recheckOptions(process.argv,state,audit,courts,'results-repair');
const targets=new Set(options.targets.map(x=>x.key));
const runCourts=selected?[selected]:options.scoped?courts.filter(c=>options.targets.some(x=>x.court===c)):courts;
const checkpointPath=`${root}/${options.prefix}-checkpoint.json`;
const checkpoint=await load(checkpointPath,{auditRun:audit.run,courts:{},matchedKeys:[],unsupported:[],targetKeys:[...targets]});if(checkpoint.auditRun!==audit.run)throw Error('Different audit requires separate checkpoint');
if(options.scoped&&JSON.stringify(checkpoint.targetKeys)!==JSON.stringify([...targets]))throw Error('Checkpoint target set changed');
const matched=new Set(checkpoint.matchedKeys);const lock=await open(`${root}/running.lock`,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,mode:'results-repair',startedAt:new Date().toISOString()}));
const progress={id:randomUUID(),pid:process.pid,mode:'results-repair',status:'starting',scope:'seoul-gyeonggi',startedAt:new Date().toISOString(),attempted:0,succeeded:0,failed:0,photos:0,errors:[],pages:0};
const record=async(e)=>{await appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),run:progress.id,...e})+'\n');await atomic(`${root}/progress.json`,progress);console.log(JSON.stringify(e));};
let browser,page,blocked=false,pending=new Set(),lastNetwork=0;
const guard=async()=>{if(blocked||/비정상적인 접근|자동입력 방지문자|접속이 차단|요청 횟수.*초과/.test(await page.locator('body').innerText()))throw Error('Official access refused; no bypass');};
const table=()=>page.locator('table[summary="매각결과검색 목록"]:visible');
const rows=()=>table().locator('tbody tr:visible').evaluateAll(es=>es.map(e=>[...e.cells].map(c=>c.innerText)));
const stable=async()=>{await table().waitFor();let last='',same=0;for(let n=0;n<100;n++){await guard();await delay(200);const value=JSON.stringify(await rows());same=value===last?same+1:0;last=value;if(same>=3&&pending.size===0&&Date.now()-lastNetwork>=800)return JSON.parse(value);}throw Error('Official result rows did not stabilize');};
const goPage=async(number)=>{for(let n=0;n<100;n++){await guard();const button=page.getByRole('button',{name:String(number),exact:true});if(await button.count()){if(await button.getAttribute('title')!=='선택됨'){await button.click();await page.waitForFunction(number=>[...document.querySelectorAll('[title="선택됨"]')].some(e=>e.textContent.trim()===String(number)),number,{timeout:20000});}await stable();return;}const numbers=await page.getByRole('button').evaluateAll(es=>es.map(e=>e.innerText.trim()).filter(x=>/^\d+$/.test(x)).map(Number));await page.getByRole('button',{name:number<Math.min(...numbers)?'이전 목록':'다음 목록',exact:true}).click();await delay(400);}throw Error('Result pagination limit');};
const sync=async()=>{progress.syncStatus='running';await record({stage:'sync-start'});const began=Date.now(),log=await open(`${root}/pipeline.log`,'a');try{const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/court/pipeline.mjs'],{stdio:['ignore',log.fd,log.fd],windowsHide:true});child.on('error',reject);child.on('exit',resolve);});const report=await load('data/court/pipeline/latest.json',{});const errors=(report.errors??[]).filter(e=>e.stage!=='matching');progress.syncStatus=report.finishedAt&&Date.parse(report.finishedAt)>=began&&!errors.length&&[0,1].includes(code)?'completed':'failed';progress.lastSyncAt=new Date().toISOString();await record({stage:'sync-finish',status:progress.syncStatus,databaseErrors:errors.length,matchingDeferred:(report.errors??[]).filter(e=>e.stage==='matching').length});if(progress.syncStatus==='failed')throw Error('Court DB synchronization failed');}finally{await log.close();}};
try{
 await mkdir(`${root}/result-proofs`,{recursive:true});
 // Publish validated case-search evidence without changing any list price/date or inferring closure.
 for(const [key,result]of Object.entries(cases.items)){const e=result.evidence,item=state.items[key];if(!targets.has(key)||!e||!item)continue;if(e.court!==item.court||e.caseNumber!==item.caseNumber||e.itemNumber!==item.itemNumber||e.verification!=='official-case-search'||new URL(e.sourceUrl).origin!=='https://www.courtauction.go.kr'||!Number.isFinite(Date.parse(e.observedAt)))throw Error('Stored case evidence identity/provenance mismatch');item.caseSearchEvidence=e;}
 await atomic('data/court/current.json',state);
 browser=await chromium.launch({channel:'msedge',headless:true});page=await browser.newPage({locale:'ko-KR'});page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(45000);
 page.on('response',r=>{if(new URL(r.url()).hostname==='www.courtauction.go.kr'&&[403,429].includes(r.status()))blocked=true;});page.on('dialog',async d=>{if(/차단|비정상|자동입력|보안문자|접속.*제한/.test(d.message()))blocked=true;await d.dismiss();});
 page.on('request',r=>{if(new URL(r.url()).hostname==='www.courtauction.go.kr'&&['fetch','xhr','document'].includes(r.resourceType())&&!r.url().includes('selectRletYrDspslStats')){pending.add(r);lastNetwork=Date.now();}});const finished=r=>{if(pending.delete(r))lastNetwork=Date.now();};page.on('requestfinished',finished);page.on('requestfailed',finished);
 progress.status='running';await record({stage:'result-repair-start',targets:targets.size,courts:runCourts});
 outer:for(const court of runCourts){if(checkpoint.courts[court]?.complete)continue;if(await stopped()){progress.status='stopped';break;}
  progress.current={court,page:checkpoint.courts[court]?.nextPage??1};await record({stage:'result-search-start',court});
  await page.goto('https://www.courtauction.go.kr/pgj/index.on',{waitUntil:'domcontentloaded'});
  await page.getByRole('dialog').last().waitFor({timeout:4000}).catch(()=>{});
  for(let notice=0;notice<6&&await page.getByRole('dialog').count();notice++){const dialog=page.getByRole('dialog').last();const text=await dialog.innerText();if(!text.startsWith('공지사항')||/차단|비정상|자동입력|보안문자/.test(text))throw Error('Unrecognized or access-control dialog; not dismissed');const close=dialog.getByTitle('공지사항 팝업창 닫기 버튼',{exact:true});if(await close.count()!==1)throw Error('Notice close control unavailable');await close.click();await delay(300);}
  await guard();await page.getByRole('link',{name:'매각결과검색',exact:true}).first().click();await page.waitForFunction(()=>document.querySelector('#mf_wfm_mainFrame_sbx_dspslRsltSrchCortOfc')?.options.length>10);await page.locator('#mf_wfm_mainFrame_sbx_dspslRsltSrchCortOfc').selectOption(court);await page.locator('#mf_wfm_mainFrame_btn_dspslRsltSrch').click();
  await page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).waitFor();await page.waitForFunction(()=>document.body.innerText.includes('총 물건수'),null,{timeout:20000});await guard();let query=await page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();if(!query.includes(court))throw Error('Result court query mismatch');const total=Number(query.match(/총 물건수\s*([\d,]+)/)?.[1]?.replaceAll(',',''));if(!Number.isInteger(total)||total<0)throw Error('Missing official result count');
  if(total===0){checkpoint.courts[court]={complete:true,nextPage:1,total,checkedAt:new Date().toISOString()};await atomic(checkpointPath,checkpoint);await record({stage:'result-page-checked',court,total:0,complete:true});continue;}
  await page.locator('#mf_wfm_mainFrame_sbx_pageSize').selectOption('40');await stable();const lastPage=Math.ceil(total/40);
  for(let number=checkpoint.courts[court]?.nextPage??1;number<=lastPage;number++){
   if(await stopped()){progress.status='stopped';break outer;}if(progress.pages>=maxPages)break outer;await goPage(number);const raw=await stable();query=await page.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();if(!query.includes(court)||Number(query.match(/총 물건수\s*([\d,]+)/)?.[1]?.replaceAll(',',''))!==total)throw Error('Official result query changed');
   const chosen=selectTargetResults(raw,court,targets),stamp=new Date().toISOString();const payload={kind:'court-results',court,query,rows:chosen.rows,sourceUrl:page.url(),observedAt:stamp};const proofs=parseResults(payload);await atomic(`${root}/result-proofs/${progress.id}-${courts.indexOf(court)}-${number}.json`,{...payload,unsupported:chosen.unsupported,total,page:number});
   for(const proof of proofs){const key=`${court}:${proof.caseNumber}:${proof.itemNumber}`,item=state.items[key];if(!item||!targets.has(key))throw Error('Out-of-scope result identity');if(item.auctionDate&&item.auctionDate>proof.auctionDate)continue;if(item.resultEvidence?.observedAt>stamp)continue;item.resultEvidence=proof;matched.add(key);progress.succeeded++;}
   progress.pages++;progress.attempted+=proofs.length;progress.current={court,page:number};await atomic('data/court/current.json',state);checkpoint.matchedKeys=[...matched];checkpoint.unsupported.push(...chosen.unsupported);checkpoint.courts[court]={complete:number===lastPage,nextPage:number+1,total,checkedAt:stamp};await atomic(checkpointPath,checkpoint);await record({stage:'result-page-checked',court,page:number,lastPage,matched:proofs.length,total,complete:number===lastPage});await delay(700);
  }
 }
 await sync();
 if(progress.status!=='stopped')progress.status=progress.pages>=maxPages?'limit-reached':'pass-finished';
 await atomic(`${root}/${options.prefix}-audit.json`,{checkedAt:new Date().toISOString(),auditRun:audit.run,allCourtsTraversed:runCourts.every(c=>checkpoint.courts[c]?.complete),targets:targets.size,matched:[...matched],unobserved:[...targets].filter(k=>!matched.has(k)),unsupported:checkpoint.unsupported,collectionComplete:false,reason:'최근 7일 공식 매각결과를 대조했습니다. 결과 미제공은 종료 근거가 아니며 상세·사진 미확보는 그대로 유지합니다.'});
}catch(e){progress.status='blocked';progress.error=e.message;progress.failed++;progress.errors.push({message:e.message,current:progress.current});process.exitCode=1;}
finally{progress.finishedAt=new Date().toISOString();await record({stage:'finish',status:progress.status,succeeded:progress.succeeded,pages:progress.pages,error:progress.error});await atomic(`${root}/run-${progress.id}.json`,progress);await browser?.close();await lock.close();await unlink(`${root}/running.lock`);}
