import {writeJson} from './atomic.mjs';
import {mkdir,readFile,writeFile,rename,open,unlink,access,appendFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {DETAIL_ENDPOINT,decode,rowsOf,identity} from './core.mjs';
import {evidence,matchDetails,validManagement} from './detail-core.mjs';
import {reserve} from './budget.mjs';
process.loadEnvFile('.env.local');
const root='data/onbid';await mkdir(`${root}/detail-raw`,{recursive:true});
async function read(name,fallback){try{return JSON.parse(await readFile(`${root}/${name}`,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function save(name,value){await writeJson(`${root}/${name}`,value);}
async function exists(path){try{await access(path);return true;}catch{return false;}}
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
if(await exists(`${root}/STOP`))throw Error('STOP_PRESENT');
const list=await read('progress.json',{});if(list.status!=='list_completed')throw Error('LIST_NOT_COMPLETED');
const state=await read('detail-progress.json',{runStartedAt:new Date().toISOString(),listRunStartedAt:list.runStartedAt,status:'pending',completed:{},requests:0,pages:0,dbRows:0,matchedConditions:0,missingConditions:0,photoLinks:0,documentLinks:0,propertiesWithPhotos:0,propertiesWithDocuments:0,thumbnailLinks:0,errors:[]});
if(state.listRunStartedAt!==list.runStartedAt)throw Error('CHECKPOINT_RUN_MISMATCH');
if(state.status==='completed'){console.log('DETAIL_ALREADY_COMPLETED');process.exit(0);}
const pause=await read('access-paused.json',{});
if(pause.detail?.requiresUserApproval||pause.detail?.blockedDay===day())throw Error('DETAIL_ACCESS_PAUSED');
// Share the collector lock: budget.json and DB writes have a single owner.
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const targets=await read('targets.json',{}),groups=new Map();
for(const r of Object.values(targets)){if(!validManagement(r.cltrMngNo))throw Error('INVALID_MANAGEMENT_NUMBER');const g=groups.get(r.cltrMngNo)??[];g.push(r);groups.set(r.cltrMngNo,g);}
const budget=await read('budget.json',{days:{}});
const event=async e=>appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),...e})+'\n');
async function publish(){state.updatedAt=new Date().toISOString();state.total=groups.size;state.processed=Object.keys(state.completed).length;state.remaining=state.total-state.processed;state.pid=process.pid;await save('detail-progress.json',state);}
let lastRequest=0;
const lock=await open(`${root}/running.lock`,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),command:'scripts/onbid/detail.mjs'}));
try{
 state.status='running';state.errors=[];await publish();
 for(const [management,group] of groups){
  if(state.completed[management])continue;
  if(await exists(`${root}/STOP`))throw Error('STOP_PRESENT');
  state.current=management;let all=[];
  for(let page=1; ;page++){
   if(await exists(`${root}/STOP`))throw Error('STOP_PRESENT');
   const cache=`detail-raw/${management}-${page}.txt`;let raw;
   if(await exists(`${root}/${cache}`))raw=await readFile(`${root}/${cache}`,'utf8');
   else{
    const today=day();
    await new Promise(r=>setTimeout(r,Math.max(0,1100-(Date.now()-lastRequest))));
    reserve(budget,today,'detail');await save('budget.json',budget);state.requests++;await publish();lastRequest=Date.now();
    const url=new URL(DETAIL_ENDPOINT);for(const [k,v] of Object.entries({serviceKey:process.env.ONBID_API_KEY,pageNo:String(page),numOfRows:'100',resultType:'json',cltrMngNo:management}))url.searchParams.set(k,v);
    let response;try{response=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});}catch{throw Error('DETAIL_FETCH_TIMEOUT_OR_NETWORK');}
    raw=await response.text();
    if(!response.ok){await writeFile(`${root}/detail-last-failed-response.txt`,raw);if([403,429].includes(response.status)){const p=await read('access-paused.json',{});p.detail={...p.detail,blockedDay:day(),blockedAt:new Date().toISOString(),latestHttp:response.status};await save('access-paused.json',p);}throw Error(`HTTP_${response.status}`);}
    try{decode(raw);}catch(e){await writeFile(`${root}/detail-last-failed-response.txt`,raw);if(/^API_(20|22|23|29|30|31)$/.test(e.message)){const p=await read('access-paused.json',{});p.detail={...p.detail,blockedDay:day(),blockedAt:new Date().toISOString(),latestCode:e.message};await save('access-paused.json',p);}throw e;}
    await writeFile(`${root}/${cache}`,raw);
   }
   const envelope=decode(raw),rows=rowsOf(envelope),total=Number(envelope.body.totalCount),size=Number(envelope.body.numOfRows);
   if(!envelope.noData&&(!Number.isSafeInteger(total)||total<0||!Number.isSafeInteger(size)||size<=0||Number(envelope.body.pageNo)!==page||(!rows.length&&(page-1)*size<total)))throw Error('DETAIL_INCOMPLETE_PAGE');
   if(rows.some(r=>all.some(old=>identity(old)===identity(r))))throw Error('DETAIL_REPEATED_PAGE');
   all.push(...rows);if(envelope.noData||page*size>=total)break;
  }
  const matched=matchDetails(management,group,all),observedAt=new Date().toISOString();let dbRows=0;
  for(let start=0;start<matched.length;start+=100){
   const batch=matched.slice(start,start+100);
   const lookup=await db.from('properties').select('id,source_property_id,auction_condition_id').eq('source','onbid').eq('source_property_id',management).in('auction_condition_id',batch.map(r=>String(r.list.pbctCdtnNo)));
   if(lookup.error)throw Error(`DB_DETAIL_LOOKUP_${lookup.error.code}`);const ids=new Map(lookup.data.map(r=>[`${r.source_property_id}:${r.auction_condition_id}`,r.id]));
   const observations=batch.map(({list,detail})=>({property_id:ids.get(identity(list)),observed_at:observedAt,list_payload:list,detail_payload:detail,detail_status:detail?'completed':'not_provided',...evidence(detail??{})}));
   if(observations.some(r=>!r.property_id))throw Error('DB_DETAIL_IDENTITY_MISSING');
   const result=await db.from('onbid_observations').upsert(observations,{onConflict:'property_id'});if(result.error)throw Error(`DB_DETAIL_SAVE_${result.error.code}`);
   dbRows+=observations.length;
  }
  // Count links once per physical property, not once per future auction round.
  const uniquePhotos=new Map(),uniqueDocs=new Map();for(const {detail} of matched){const e=evidence(detail??{});e.photos.forEach(v=>uniquePhotos.set(v.url,v));e.documents.forEach(v=>uniqueDocs.set(v.url,v));}
  state.dbRows+=dbRows;state.dbUpdatedAt=observedAt;state.matchedConditions+=matched.filter(r=>r.detail).length;state.missingConditions+=matched.filter(r=>!r.detail).length;
  state.photoLinks+=uniquePhotos.size;state.documentLinks+=uniqueDocs.size;state.thumbnailLinks+=[...uniquePhotos.values()].filter(v=>v.kind==='thumbnail').length;
  if(uniquePhotos.size)state.propertiesWithPhotos++;if(uniqueDocs.size)state.propertiesWithDocuments++;
  state.completed[management]={at:observedAt,conditions:matched.length,matched:matched.filter(r=>r.detail).length,photos:uniquePhotos.size,documents:uniqueDocs.size};state.pages+=Math.max(1,Math.ceil(all.length/100));
  await publish();await event({type:'detail_saved',management,conditions:matched.length,dbRows,photos:uniquePhotos.size,documents:uniqueDocs.size});
 }
 state.status='completed';state.finishedAt=new Date().toISOString();await publish();await event({type:'detail_completed',processed:state.processed,dbRows:state.dbRows});
}catch(e){state.status=e.message==='STOP_PRESENT'?'stopped':e.message==='DAILY_BUDGET_EXHAUSTED'?'budget_wait':'failed';state.errors=state.status==='budget_wait'?[]:[{at:new Date().toISOString(),code:e.message}];await publish();await event({type:'detail_pause',status:state.status,code:e.message});process.exitCode=state.status==='budget_wait'?0:1;}
finally{await lock.close();await unlink(`${root}/running.lock`);console.log(JSON.stringify({status:state.status,processed:state.processed,total:state.total,dbRows:state.dbRows,errors:state.errors}));}
