// Run one failed step of today's daily job again by hand, and when that leaves no failed step, mark the
// day's job completed everywhere the factory looks:
//   data/daily/reruns.jsonl      → this PC's status screen and watchdog (watch-core resolvedByRerun)
//   public.factory_job_leases    → 12시/14시/20시 마감 알림 and the daily "데이터 공장" report (factory.mjs)
// Before 2026-11-25 only the local file was written by hand, so the deadline notice still said
// "아무 컴퓨터도 끝내지 못함" for a job that had been fixed.
//   node scripts/daily/rerun-step.mjs --job=market --step=region-watch [--day=2026-11-25] [--dry]
import {readFile,appendFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {koreanDay} from './core.mjs';
import {db} from './factory.mjs';
import {resolvedByRerun} from './watch-core.mjs';

// Same script and arguments as scripts/daily/run.mjs uses for that step.
export const STEPS={
 market:{
  publish:['scripts/molit/publish.mjs',[]],'region-health':['scripts/daily/region-health.mjs',[]],
  analyze:['scripts/molit/analyze.mjs',[]],'sale-signals':['scripts/signals/sale-signals.mjs',[]],
  geo:['scripts/geo/coords.mjs',['--limit','25000']],stations:['scripts/geo/stations.mjs',[]],
  schools:['scripts/geo/schools.mjs',['--fetch-minutes','20']],neighborhood:['scripts/geo/neighborhood.mjs',['--fetch-minutes','25']],
  'loan-rates':['scripts/finance/kfb-rates.mjs',[]],'loan-products':['scripts/finance/finlife-products.mjs',[]],
  stats:['scripts/refresh-stats.mjs',[]],'region-pyeong-price':['scripts/refresh-region-pyeong-price.mjs',[]],
  'complex-briefs':['scripts/refresh-complex-briefs.mjs',[]],recommend:['scripts/refresh-recommend.mjs',[]],
  'region-watch':['scripts/daily/region-watch.mjs',[]],revalidate:['scripts/revalidate-lineestate.mjs',[]],
  alerts:['scripts/alerts/send.mjs',[]],indexnow:['scripts/indexnow.mjs',['--near']],
 },
 onbid:{
  'refresh-current':['scripts/refresh-current.mjs',[]],'fill-pnu':['scripts/geo/fill-pnu.mjs',[]],
  alerts:['scripts/alerts/send.mjs',[]],indexnow:['scripts/indexnow.mjs',[]],
 },
 court:{
  'court-past-results':['scripts/court/past-results.mjs',[]],'court-pipeline':['scripts/court/pipeline-bulk.mjs',['--months=24']],
  'refresh-current':['scripts/refresh-current.mjs',[]],'fill-pnu':['scripts/geo/fill-pnu.mjs',[]],
  alerts:['scripts/alerts/send.mjs',[]],indexnow:['scripts/indexnow.mjs',[]],
 },
};

const kstDay=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date(iso));
const lines=async path=>(await readFile(path,'utf8').catch(()=>'')).split(/\r?\n/).filter(Boolean).flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});

// The day's last finished run of the job (runs.jsonl keeps start lines and skips too).
export function lastRun(history,job,day){
 return history.filter(r=>r.job===job&&(r.status==='completed'||r.status==='failed')&&kstDay(r.startedAt??r.at)===day).at(-1)??null;
}

if(String(process.argv[1]??'').replace(/\\/g,'/').endsWith('scripts/daily/rerun-step.mjs')){
 const arg=key=>process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
 const job=arg('job'),name=arg('step'),day=arg('day')??koreanDay(),dry=process.argv.includes('--dry');
 const known=STEPS[job]?.[name];
 if(!known)throw Error(`--job/--step: 다시 돌릴 수 있는 단계는 ${Object.entries(STEPS).map(([j,s])=>`${j}: ${Object.keys(s).join(', ')}`).join(' / ')}`);
 const run=lastRun(await lines('data/daily/runs.jsonl'),job,day);
 if(!run)throw Error(`${day} ${job} 실행 기록이 없습니다`);
 const failed=(run.steps??[]).filter(s=>s.code!==0).map(s=>s.name);
 if(!failed.includes(name))throw Error(`${day} ${job}에서 ${name}은 실패하지 않았습니다 (실패: ${failed.join(', ')||'없음'})`);

 const [script,args]=known;
 const code=dry?0:await new Promise(resolve=>{
  const child=spawn(process.execPath,[script,...args],{stdio:'inherit',windowsHide:true});
  child.on('exit',c=>resolve(c??1));
 });
 const entry={job,step:name,ok:code===0,code,at:new Date().toISOString(),day,by:'rerun-step'};
 if(!dry)await appendFile('data/daily/reruns.jsonl',JSON.stringify(entry)+'\n');
 if(code!==0){console.log(JSON.stringify({...entry,leaseUpdated:false}));process.exit(code);}

 // Every failed step now has a passing rerun → the day's job is done.
 const reruns=[...await lines('data/daily/reruns.jsonl'),...(dry?[entry]:[])];
 let leaseUpdated=false;
 if(resolvedByRerun({...run,job},reruns)){
  const {data:rows,error}=await db.from('factory_job_leases').select('status,summary').eq('job',job).eq('day',day);
  if(error)throw Error(error.message);
  const lease=rows?.[0];
  if(lease?.status==='failed'&&!dry){
   const summary={...(lease.summary??{}),rerun:reruns.filter(r=>r.job===job&&r.ok&&failed.includes(r.step)&&r.at>=(run.startedAt??'')).map(r=>({step:r.step,at:r.at}))};
   const {data:u,error:e}=await db.from('factory_job_leases').update({status:'completed',summary}).eq('job',job).eq('day',day).eq('status','failed').select('job');
   if(e)throw Error(e.message);
   leaseUpdated=!!u?.length;
  }
 }
 console.log(JSON.stringify({...entry,failed,leaseUpdated,dry}));
}
