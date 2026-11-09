// Daily runner: one entry point for the 10:00 Onbid and 15:00 court jobs, started either by
// Windows Task Scheduler (--trigger=schedule) or by hand (--trigger=manual, desktop shortcut or
// the local settings page). It owns ordering between jobs; each collector keeps its own
// checkpoint, quota and STOP handling.
// Several PCs may run this; a Supabase lease (factory.mjs) lets one of them do each day's job, and the
// collectors' local state travels through the private storage bucket (bundle.mjs).
import {mkdir,readFile,writeFile,appendFile,open,unlink} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {sendWindowsNotification} from '../court/windows-notify.mjs';
import {JOBS,koreanDay,scheduledSkip,lockState,onbidMessage,beforeSchedule,runsOn,kstWeekday} from './core.mjs';
import {lease as factoryLease,machineName,noticeTakeover,noticeStale,dailyNotices,notifyOperator} from './factory.mjs';
import {JOB_BUNDLES,download as downloadBundle,upload as uploadBundle} from './bundle.mjs';

const root='data/daily';await mkdir(root,{recursive:true});
const arg=key=>process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
const job=arg('job'),trigger=arg('trigger')??'manual';
if(!JOBS.includes(job))throw Error(`--job must be one of ${JOBS.join(', ')}`);
if(!['schedule','manual','chain'].includes(trigger))throw Error('--trigger must be schedule, manual or chain');
const LABELS={onbid:'온비드 공매',court:'법원 경매',market:'단지·실거래'};
const label=LABELS[job];
// FACTORY_DAY, FACTORY_FAKE_STEPS and FACTORY_FAKE_DOWNLOAD_FAIL are for trying the multi-PC handover
// without collecting anything.
const day=process.env.FACTORY_DAY??koreanDay();
const machine=machineName(arg('machine'));
const fakeSteps=Number(process.env.FACTORY_FAKE_STEPS??0);

const readJson=async(path,fallback)=>{try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const history=async()=>(await readFile(`${root}/runs.jsonl`,'utf8').catch(()=>'')).split('\n').filter(Boolean).map(l=>JSON.parse(l));
const record=run=>appendFile(`${root}/runs.jsonl`,JSON.stringify(run)+'\n');
const notify=(title,message)=>sendWindowsNotification({title:`선경매 · ${title}`,message}).catch(e=>console.error('notification failed',e.message));
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};

// 1. Scheduled starts (daily time, missed-run catch-up, or logon) wait for the job's hour and skip
//    when the job already ran today. Manual runs always proceed.
// 'chain' starts (Onbid right after market, court right after Onbid) skip the hour check but otherwise behave like scheduled ones;
// the 15:00 task stays as a fallback and skips itself once the chained run has finished.
if(trigger==='schedule'&&(!runsOn(job)||beforeSchedule(job)))process.exit(0);
if(trigger==='chain'&&!runsOn(job))process.exit(0);
if(trigger!=='manual'){
 const skip=scheduledSkip(await history(),job,day);
 if(skip.skip){
  await record({job,trigger,day,status:'skipped',reason:skip.reason,at:new Date().toISOString()});
  if(skip.reason==='manual-today')await notify(`${label} 자동 실행 건너뜀`,`오늘 이미 수동으로 실행했습니다${skip.at?` (${new Date(skip.at).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'})})`:''}.\n내일 정해진 시간에 다시 실행합니다.`);
  process.exit(0);
 }
}

// 2. One job at a time. Manual starts report a busy runner; scheduled ones wait their turn.
const lockPath=`${root}/running.lock`;
let lock;
for(const started=Date.now();;){
 const state=lockState(await readJson(lockPath,null),alive);
 if(state==='stale')await unlink(lockPath).catch(()=>{});
 try{lock=await open(lockPath,'wx');break;}catch(e){if(e.code!=='EEXIST')throw e;}
 const holder=await readJson(lockPath,null);
 if(trigger==='manual'){await notify(`${label} 실행 안 함`,`${LABELS[holder?.job]??'다른'} 작업이 이미 실행 중입니다.\n끝난 뒤 다시 시도해 주세요.`);process.exit(0);}
 if(Date.now()-started>8*3600_000){await record({job,trigger,day,status:'failed',reason:'lock-timeout',at:new Date().toISOString()});await notify(`${label} 시작 실패`,'다른 작업이 8시간 넘게 끝나지 않았습니다. 설정 화면을 확인해 주세요.');process.exit(1);}
 await delay(60_000);
}
// A scheduled and a chained start can both queue for the lock; the second one to get it skips.
if(trigger!=='manual'&&scheduledSkip(await history(),job,day).skip){await lock.close();await unlink(lockPath).catch(()=>{});process.exit(0);}
const run={job,trigger,day,startedAt:new Date().toISOString(),pid:process.pid,steps:[]};
await lock.writeFile(JSON.stringify({job,trigger,pid:process.pid,startedAt:run.startedAt}));
await writeFile(`${root}/current.json`,JSON.stringify(run,null,2));
const release=async()=>{await unlink(`${root}/current.json`).catch(()=>{});await lock.close();await unlink(lockPath).catch(()=>{});};

// 3. Latest code, then the day's lease. Another PC running any job means wait (scheduled) or stop
//    (manual); a job another PC finished today is skipped; one whose PC went quiet is taken over.
run.machine=machine;
if(process.env.FACTORY_GIT_PULL!=='off'){
 const pull=spawnSync('git',['pull','--ff-only','-q'],{windowsHide:true,encoding:'utf8',timeout:120_000});
 run.pull=pull.status===0?'ok':`failed: ${(pull.stderr||pull.error?.message||'').trim().split('\n').at(-1)}`;
}
const lease=factoryLease({job,day,machine});
let claim;
for(const started=Date.now();;){
 try{claim=await lease.claim(trigger==='manual');}catch(e){claim={claimed:false,reason:'error',error:e.message};}
 if(claim.claimed)break;
 const why={busy:`${claim.holder}에서 ${LABELS[claim.job]??claim.job} 작업 중`,held:`${claim.holder}에서 실행 중`,done:`오늘 ${claim.holder}에서 이미 끝냄`,'gave-up':`오늘 ${claim.attempt}번 실패해서 자동으로 더 하지 않음`,error:`잠금 확인 실패: ${claim.error}`}[claim.reason]??claim.reason;
 const wait=trigger!=='manual'&&['busy','held','error'].includes(claim.reason)&&Date.now()-started<8*3600_000;
 // The progress window shows this instead of a step list while another PC holds the day.
 if(wait){run.waiting={reason:claim.reason,holder:claim.holder??null,job:claim.job??null,why,checkedAt:new Date().toISOString()};await writeFile(`${root}/current.json`,JSON.stringify(run,null,2));}
 if(!wait){
  await record({job,trigger,day,machine,status:'skipped',reason:`lease-${claim.reason}`,holder:claim.holder??null,at:new Date().toISOString()});
  if(trigger==='manual'||claim.reason==='gave-up')await notify(`${label} 실행 안 함`,why);
  console.log(JSON.stringify({job,machine,skipped:claim.reason,holder:claim.holder??null}));
  await release();process.exit(0);
 }
 await delay(Math.min(60_000,Number(process.env.FACTORY_LEASE_SECONDS??900)*1000/3));
}
delete run.waiting;run.claim=claim;lease.start();
if(['takeover','retry'].includes(claim.reason))await noticeTakeover({job,day,machine,claim}).catch(e=>console.error(e.message));

// 4. This job's state from whichever PC ran it last. Without it (no network, a broken download)
//    the collectors still run, but steps that remove or overwrite rows are skipped and nothing is
//    uploaded, so an old copy can never replace newer data.
const DANGER=new Set(['publish','onbid-lifecycle','refresh-current','court-pipeline','alerts']);
run.bundles=[];let stale=null;
for(const name of JOB_BUNDLES[job]){
 try{
  if(process.env.FACTORY_FAKE_DOWNLOAD_FAIL)throw Error('시험: 내려받기 실패로 가정');
  run.bundles.push(await downloadBundle(name));
 }
 catch(e){stale=`${name} 기록을 받지 못함: ${e.message}`;run.bundles.push({bundle:name,status:'failed',error:e.message});}
}
if(stale){run.stale=stale;await noticeStale({job,day,machine,reason:stale}).catch(e=>console.error(e.message));}

// Each step is a separate collector process with its own time limit.
// A scheduled run after a failed one today redoes only what didn't succeed: steps that already
// finished in an earlier run today are skipped (alerts always run).
const doneToday=new Set(trigger==='manual'?[]:(await history()).filter(r=>r.job===job&&r.day===day&&r.status==='failed').flatMap(r=>(r.steps??[]).filter(s=>s.code===0).map(s=>s.name)));
doneToday.delete('alerts');
async function courtStateGuard(){
 const {readdir,copyFile}=await import('node:fs/promises');
 const valid=async path=>{try{const s=JSON.parse(await readFile(path,'utf8'));return !!s&&typeof s.items==='object';}catch{return false;}};
 const dir='data/court/backups';await mkdir(dir,{recursive:true});
 const backups=async()=>(await readdir(dir)).filter(n=>/^current-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
 if(await valid('data/court/current.json')){
  await copyFile('data/court/current.json',`${dir}/current-${day}.json`);
  for(const old of (await backups()).slice(3))await unlink(`${dir}/${old}`).catch(()=>{});
  return;
 }
 await copyFile('data/court/current.json',`data/court/current.corrupt-${Date.now()}.json`).catch(()=>{});
 for(const name of await backups())if(await valid(`${dir}/${name}`)){
  await copyFile(`${dir}/${name}`,'data/court/current.json');
  await notify(`${label} 기록 파일 복구`,`법원 기록 파일이 깨져 있어 ${name} 백업으로 되돌렸습니다. 그 뒤 바뀐 내용은 오늘 수집에서 다시 받습니다.`);
  return;
 }
 await step('court-state-rebuild','scripts/court/rebuild-state.mjs',['--write'],60*60_000);
 await notify(`${label} 기록 파일 복구`,'법원 기록 파일이 깨져 있어 저장된 수집 기록으로 다시 만들었습니다.');
}
function step(name,script,args,timeoutMs){
 if(lease.state.lost)throw Error('LEASE_LOST: 다른 컴퓨터가 이 작업을 이어받음');
 if(stale&&DANGER.has(name)){
  const entry={name,code:0,seconds:0,timedOut:false,result:'수집 기록이 최신이 아니라 건너뜀',skipped:true,stale:true};
  run.steps.push(entry);void writeFile(`${root}/current.json`,JSON.stringify(run,null,2));
  return Promise.resolve(entry);
 }
 if(fakeSteps){
  return delay(fakeSteps*1000).then(()=>{const entry={name,code:0,seconds:fakeSteps,timedOut:false,result:'fake',fake:true};run.steps.push(entry);void writeFile(`${root}/current.json`,JSON.stringify(run,null,2));return entry;});
 }
 if(doneToday.has(name)){
  const entry={name,code:0,seconds:0,timedOut:false,result:'오늘 앞선 실행에서 완료',skipped:true};
  run.steps.push(entry);void writeFile(`${root}/current.json`,JSON.stringify(run,null,2));
  return Promise.resolve(entry);
 }
 return new Promise(resolve=>{
  const started=Date.now();let out='';
  const child=spawn(process.execPath,[script,...args],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>{out=(out+d).slice(-4000);});child.stderr.on('data',d=>{out=(out+d).slice(-4000);});
  const timer=setTimeout(()=>child.kill(),timeoutMs);
  child.on('exit',code=>{clearTimeout(timer);const last=out.trim().split('\n').at(-1)??'';let result=null;try{result=JSON.parse(last);}catch{}
   // A crash ends with Node's version line; keep the actual error line instead so failures are explainable.
   const errorLine=code!==0&&!result?out.split('\n').map(l=>l.trim()).filter(l=>/(Error|error:|ERR_|failed)/.test(l)&&!/^at /.test(l)).at(-1):null;
   const entry={name,code,seconds:Math.round((Date.now()-started)/1000),timedOut:Date.now()-started>=timeoutMs,result:result??(errorLine??last).slice(0,300)};
   run.steps.push(entry);void writeFile(`${root}/current.json`,JSON.stringify(run,null,2));resolve(entry);});
 });
}

// Right after boot the network may not be up yet; a first step that fails on that is lost for the
// day. Wait up to 15 minutes for the public-data gateway to answer before starting.
for(const started=Date.now();;){
 const online=await fetch('https://apis.data.go.kr/',{method:'HEAD',signal:AbortSignal.timeout(10000)}).then(()=>true,()=>false);
 if(online)break;
 if(Date.now()-started>15*60_000){await notify(`${label} 인터넷 연결 없음`,'15분 동안 인터넷에 연결되지 않아 그대로 시작합니다. 실패한 단계는 다음 실행 때 이어받습니다.');break;}
 await delay(30_000);
}
await notify(`${label} ${trigger==='manual'?'수동':'자동'} 실행 시작`,'진행 상황은 바탕화면 "선경매 진행 상황 보기"에서 볼 수 있습니다.\n끝나면 결과를 알려드립니다.');
try{
 if(job==='onbid'){
  // List refresh (≈276 requests, apartments kept), then the detail notes of new apartments (risk flags).
  const list=await step('onbid-list','scripts/onbid/collect.mjs',['--refresh'],3*3600_000);
  // Only a completed list pass may mark missing listings (needs-recheck, then closed on day two).
  const listed=(await readJson('data/onbid/progress.json',{})).status==='list_completed';
  const lifecycle=listed?await step('onbid-lifecycle','scripts/onbid/lifecycle-sync.mjs',[],10*60_000):null;
  const detail=await step('onbid-detail','scripts/onbid/detail.mjs',[],4*3600_000);
  await step('refresh-current','scripts/refresh-current.mjs',[],10*60_000);
  // PNU and map point for new listings that came without them (address search; cached).
  await step('fill-pnu','scripts/geo/fill-pnu.mjs',[],30*60_000);
  // Member alerts (saved conditions, watched properties) for what changed in this run.
  await step('alerts','scripts/alerts/send.mjs',[],15*60_000);
  const progress=await readJson('data/onbid/progress.json',{}),detailState=await readJson('data/onbid/detail-progress.json',{}),budget=await readJson('data/onbid/budget.json',{});
  const {runStartedAt,status,properties,conditions,requests,refresh,added,removed,listFinishedAt,excludedByUse}=progress;
  run.summary={list:{runStartedAt,status,properties,conditions,requests,refresh,added,removed,listFinishedAt,excludedByUse},lifecycle:lifecycle?.code===0?progress.lifecycle:null,detail:{processed:detailState.processed,total:detailState.total,remaining:detailState.remaining,status:detailState.status},usage:budget.serviceDays?.[day]??{list:0,detail:0}};
  const listOk=list.code===0||/LIST_ALREADY_COMPLETED/.test(JSON.stringify(list.result));
  const detailOk=detail.code===0;
  run.status=listOk&&detailOk?'completed':'failed';
  const message=onbidMessage({list:run.summary.list,lifecycle:run.summary.lifecycle,detail:run.summary.detail,usage:run.summary.usage});
  const note=detailState.status==='budget_wait'?'\n오늘 상세 한도를 다 써서 내일 이어서 받습니다.':detailState.status==='completed'?'\n상세 수집이 모두 끝났습니다.':'';
  const failure=[!listOk&&`목록: ${progress.errors?.[0]?.code??list.result}`,!detailOk&&`상세: ${detailState.errors?.[0]?.code??detail.result}`].filter(Boolean).join('\n');
  await notify(run.status==='completed'?`${label} 완료`:`${label} 일부 실패`,run.status==='completed'?message+note:`${failure}\n${message}`);
 }else if(job==='market'){
  // K-APT complexes (per-day quota), then MOLIT trades (recent months reloaded daily, 3-year backfill
  // resumes), then the Supabase summaries rebuilt from the local warehouse, then current rounds and
  // 실거래 대비 할인율 (property_analysis).
  const complex=await step('complex','scripts/complex/collect.mjs',['--phase','all'],4*3600_000);
  const trades=await step('molit','scripts/molit/collect.mjs',['--months','36'],6*3600_000);
  const publish=await step('publish','scripts/molit/publish.mjs',['--with-villas'],60*60_000);
  // 시군구 전월세 전환율 for the price calculator; rates move slowly, so Mondays only.
  if(kstWeekday()===1)await step('conversion-rate','scripts/molit/conversion-rate.mjs',[],10*60_000);
  // 한국부동산원 상가·오피스 임대동향 (quarterly), refreshed on Mondays.
  // 상권 map points are cached; only new 상권 names are looked up.
  if(kstWeekday()===1){await step('r-one','scripts/calc/r-one.mjs',[],20*60_000);await step('commercial-areas','scripts/calc/commercial-areas.mjs',[],20*60_000);}
  // Build years (빌라 comparison, filters) for properties whose PNU is new, then the discounts.
  // Daily lookup limits keep the job to ~1–2 hours so the 10:00 Onbid job is not held up; backlogs
  // (e.g. after a PNU fix) are spread over several days.
  const years=await step('build-year','scripts/building-year.mjs',['--limit','600'],2*3600_000);
  // 공시가격 for new auction units and complexes, parcel facts for the 상가·건물·토지 section.
  const official=await step('official-price','scripts/geo/official-price.mjs',['--limit','3000'],3*3600_000);
  const parcels=await step('parcel-info','scripts/geo/parcel-info.mjs',['--limit','500'],2*3600_000);
  const analyze=await step('analyze','scripts/molit/analyze.mjs',[],30*60_000);
  // 매물화 신호 per building (auctions linked by analyze, 입주 연차, 거래 급증).
  await step('sale-signals','scripts/signals/sale-signals.mjs',[],20*60_000);
  // Map points for new buildings and properties (vworld parcels, cached once per PNU).
  // 빌라 buildings add ~160k parcels; a daily cap spreads the first fetch over about a week.
  const geo=await step('geo','scripts/geo/coords.mjs',['--limit','25000'],3*3600_000);
  // Nearest two 전철역, 업무지구 commute estimates per complex and 역↔역 minutes (OSM stations refetched weekly;
  // both passes are local).
  await step('stations','scripts/geo/stations.mjs',[],20*60_000);
  // 배정 초등학교 per complex (통학구역 from vworld, school points from OSM; sources refetched monthly).
  await step('schools','scripts/geo/schools.mjs',[],30*60_000);
  // 동네 환경: 공원·대형마트 (OSM) and 종합병원·의원·학원 (상가정보), sources refetched monthly.
  await step('neighborhood','scripts/geo/neighborhood.mjs',[],30*60_000);
  // 은행별 주담대·전세대출 금리 (은행연합회 비교공시, monthly); only a month not yet stored is fetched.
  await step('loan-rates','scripts/finance/kfb-rates.mjs',[],10*60_000);
  // 주담대·전세대출 상품별 금리 (금감원 금융상품한눈에 API, ~monthly); only changed rows are written.
  await step('loan-products','scripts/finance/finlife-products.mjs',[],10*60_000);
  // lineestate's region trend table (app schema), rebuilt from the refreshed summaries.
  const statsStep=await step('stats','scripts/refresh-stats.mjs',[],15*60_000);
  // lineestate's region 평당가 table (app schema), read by the 단지 상세 price comparison.
  await step('region-pyeong-price','scripts/refresh-region-pyeong-price.mjs',[],10*60_000);
  // lineestate's complex summaries read the 평당가 table just above, so this order matters.
  await step('complex-briefs','scripts/refresh-complex-briefs.mjs',[],10*60_000);
  // lineestate's recommendation table (app.recommend_base, ~10 s) reads the summaries, complexes and commutes above.
  await step('recommend','scripts/refresh-recommend.mjs',[],10*60_000);
  // lineestate's 역 근처 TOP 3 table recomputed (~2 min), its caches cleared now that their tables are
  // fresh, and re-warmed (~10k complex pages) unless LINEESTATE_WARM=off. A failure is only recorded;
  // it does not fail the run.
  const revalidateStep=await step('revalidate','scripts/revalidate-lineestate.mjs',[],85*60_000);
  // New discounts can make properties match saved 할인율 conditions.
  await step('alerts','scripts/alerts/send.mjs',[],15*60_000);
  const last=s=>String(s.result??'').slice(0,160);
  run.summary={complex:last(complex),trades:last(trades),publish:last(publish),years:last(years),official:last(official),parcels:last(parcels),analyze:last(analyze),geo:last(geo),stats:last(statsStep)};
  run.status=[complex,trades,publish,years,official,parcels,analyze,geo,statsStep].every(s=>s.code===0)?'completed':'failed';
  const message=[`단지: ${last(complex)}`,`실거래: ${last(trades)}`,`요약 업로드: ${last(publish)}`,`준공연도: ${last(years)}`,`공시가격: ${last(official)}`,`필지 정보: ${last(parcels)}`,`할인율: ${last(analyze)}`,`좌표: ${last(geo)}`,`통계: ${last(statsStep)}`,`역 근처 TOP 3: ${String(revalidateStep.result?.near??revalidateStep.result??'').slice(0,240)}`].join('\n');
  await notify(run.status==='completed'?`${label} 완료`:`${label} 일부 실패`,message);
 }else{
  if(await readFile('data/court/standalone/STOP').then(()=>true,()=>false)){
   run.status='skipped';run.reason='court-stop-file';
   await notify(`${label} 건너뜀`,'법원 수집 중지(STOP) 파일이 있어 실행하지 않았습니다.\n다시 수집하려면 data/court/standalone/STOP 파일을 지워 주세요.');
  }else{
   // The court state file must be valid before anything reads it. A good copy is backed up daily (3 kept);
   // a broken one (a power loss once zero-filled it mid-write) is restored from the newest good backup,
   // or rebuilt from the saved run inputs when no backup is usable.
   await courtStateGuard();
   // A crashed collector can leave its own lock behind; clear it only when that process is gone.
   for(const path of ['data/court/standalone/running.lock','data/court/pipeline/running.lock']){const held=await readJson(path,null);if(held&&!alive(held.pid))await unlink(path).catch(()=>{});}
   // 1) List refresh of all 16 courts + the one detail page of new apartments, 2) apartments to the DB + MOLIT.
   const list=await step('court-list','scripts/court/standalone.mjs',['--limit=100000','--repair-pass'],6*3600_000);
   // Results (매각/유찰) for items whose sale date passed in the last 7 days, before the DB sync.
   await step('court-past-results','scripts/court/past-results.mjs',[],90*60_000);
   const pipeline=await step('court-pipeline','scripts/court/pipeline-bulk.mjs',['--months=24'],3*3600_000);
   await step('refresh-current','scripts/refresh-current.mjs',[],10*60_000);
   await step('fill-pnu','scripts/geo/fill-pnu.mjs',[],30*60_000);
   await step('alerts','scripts/alerts/send.mjs',[],15*60_000);
   const collector=await readJson('data/court/standalone/progress.json',{}),latest=await readJson('data/court/pipeline/latest.json',{}),molit=await readJson('data/court/pipeline/molit-request-budget.json',{});
   run.summary={collector:{status:collector.status,attempted:collector.attempted,succeeded:collector.succeeded,failed:collector.failed,skipped:collector.skipped,excludedByUse:collector.excludedByUse,error:collector.error},
    pipeline:{status:latest.status,properties:latest.properties,lifecycle:latest.lifecycle,matchedProperties:latest.matchedProperties,matchedTrades:latest.matchedTrades,unmatched:latest.unmatched,errors:latest.errors?.length??null},
    molit:{used:molit.day===day?molit.requests:0,limit:molit.limit}};
   const listOk=list.code===0,pipelineOk=pipeline.code===0&&!(latest.errors??[]).filter(e=>e.stage!=='matching').length;
   run.status=listOk&&pipelineOk?'completed':'failed';
   const p=latest.properties??{};
   const message=[`새 아파트 상세 ${collector.attempted??0}건 (성공 ${collector.succeeded??0} · 실패 ${collector.failed??0})`,
    ...((collector.oddRows||collector.badPages)?[`읽지 못하고 건너뛴 줄 ${collector.oddRows??0}개 · 페이지 ${collector.badPages??0}개 (data/court/standalone/odd-rows.jsonl)`]:[]),
    `DB 신규 ${p.created??0} · 변경 ${p.updated??0} · 재확인 필요 ${latest.lifecycle?.['needs-recheck']??0} · 종결 ${latest.lifecycle?.closed??0}`,
    `실거래 연결 ${latest.matchedProperties??0}건 · 국토부 요청 ${run.summary.molit.used}/${run.summary.molit.limit??10000}`].join('\n');
   const failure=[!listOk&&`목록·상세: ${collector.error??collector.status??list.result}`,!pipelineOk&&`DB·실거래: ${latest.errors?.[0]?.message??latest.status??pipeline.result}`].filter(Boolean).join('\n');
   await notify(run.status==='completed'?`${label} 완료`:`${label} 일부 실패`,run.status==='completed'?message:`${failure}\n${message}`);
  }
 }
}catch(error){run.status='failed';run.error=error.message;await notify(`${label} 실패`,error.message);}
finally{
 // 5. Upload this PC's state (unless it was stale or the job was taken over), then close the lease.
 //    A stale run ends as failed so another PC with the latest state can redo it.
 if(stale&&run.status==='completed'){run.status='failed';run.error=stale;}
 run.uploads=[];
 if(!lease.state.lost&&!stale)for(const name of JOB_BUNDLES[job]){
  try{run.uploads.push(await uploadBundle(name,{machine}));}
  catch(e){run.uploads.push({bundle:name,error:e.message});await notifyOperator(`<b>⚠️ ${label}: ${machine}의 수집 기록 올리기 실패</b>
${name}: ${e.message}`).catch(()=>{});}
 }
 lease.stop();
 const versions=run.uploads.filter(u=>u.version).map(u=>`${u.bundle} ${u.version}`).join(', ')||null;
 const took=Math.round((Date.now()-Date.parse(run.startedAt))/60000);
 if(!lease.state.lost)await lease.finish(run.status==='completed'?'completed':'failed',{minutes:took,steps:run.steps.map(s=>({name:s.name,code:s.code,seconds:s.seconds,...(s.stale?{stale:true}:{})})),bundles:run.bundles,uploads:run.uploads,error:run.error??null},versions).catch(e=>console.error('lease finish failed',e.message));
 if(!process.env.FACTORY_DAY)await dailyNotices({day,machine}).catch(e=>console.error('daily notices failed',e.message));
 run.finishedAt=new Date().toISOString();
 await record(run);await writeFile(`${root}/last-${job}.json`,JSON.stringify(run,null,2));
 await unlink(`${root}/current.json`).catch(()=>{});await lock.close();await unlink(lockPath).catch(()=>{});
 console.log(JSON.stringify({job,trigger,status:run.status,steps:run.steps.map(s=>({name:s.name,code:s.code,seconds:s.seconds}))}));
 process.exitCode=run.status==='completed'?0:1;
}
// Onbid follows market and court follows Onbid (on its run days) after a 3-minute pause instead of
// waiting for the 10:00 / 15:00 tasks, which stay as fallbacks and skip themselves once it ran.
const NEXT={market:'onbid',onbid:'court'}[job];
if(NEXT&&trigger!=='manual'&&runsOn(NEXT)&&!scheduledSkip(await history(),NEXT,day).skip){
 await delay(3*60_000);
 // Its own log: <job>.log can be held open by the fallback task's redirect (EBUSY crashed this once).
 try{
  const {openSync}=await import('node:fs');
  const out=openSync(`${root}/${NEXT}-chain.log`,'a');
  spawn(process.execPath,['scripts/daily/run.mjs',`--job=${NEXT}`,'--trigger=chain',`--machine=${machine}`],{detached:true,windowsHide:true,stdio:['ignore',out,out]}).unref();
  console.log(`${NEXT} chained`);
 }catch(e){console.error(`${NEXT} chain failed; its fallback task will run it`,e.message);}
}
