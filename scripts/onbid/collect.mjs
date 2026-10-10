import {writeJson} from './atomic.mjs';
import {mkdir,readFile,writeFile,rename,open,unlink,access,appendFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {LIST_ENDPOINT,PROPERTY_CODES,partitionList,decode,rowsOf,scope,identity,toProperty,safeOfficialUrl} from './core.mjs';
import {reserve} from './budget.mjs';
process.loadEnvFile('.env.local');
const root='data/onbid';
await mkdir(`${root}/raw`,{recursive:true});
async function read(name,fallback){try{return JSON.parse(await readFile(`${root}/${name}`,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function save(name,value){await writeJson(`${root}/${name}`,value);}
async function exists(path){try{await access(path);return true;}catch{return false;}}
const state=await read('progress.json',{runStartedAt:new Date().toISOString(),status:'pending',pages:0,requests:0,rows:0,excluded:0,partition:0,nextPage:1,partitionTotals:{},completedPages:{},dbRows:0,errors:[]});
if(state.status==='list_completed'){console.log('LIST_ALREADY_COMPLETED');process.exit(0);}
if(await exists(`${root}/STOP`))throw Error('STOP_PRESENT');
const lock=await open(`${root}/running.lock`,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),command:'scripts/onbid/collect.mjs'}));
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const targets=await read('targets.json',{});
const partitions=partitionList();
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
let budget=await read('budget.json',{days:{}});
async function publish(){state.updatedAt=new Date().toISOString();state.conditions=Object.keys(targets).length;state.properties=new Set(Object.values(targets).map(r=>r.cltrMngNo)).size;state.remainingPartitions=partitions.length-state.partition;await save('progress.json',state);}
const event=async data=>appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),...data})+'\n');
try{
 const pause=await read('access-paused.json',null);
 if(pause?.list?.day===day())throw Error('LIST_ACCESS_PAUSED_TODAY');
 state.status='running';state.pid=process.pid;state.errors=[];await publish();
 for(;state.partition<partitions.length;state.partition++,state.nextPage=1){
  const p=partitions[state.partition];
  const label=`${p.region}/${p.bid}/${p.privateContract}`;
  while(true){
   if(await exists(`${root}/STOP`))throw Error('STOP_PRESENT');
   const page=state.nextPage;
   const pageKey=`${state.partition}-${page}`;
   let raw;
   const cache=`${root}/raw/${pageKey}.json`;
   if(await exists(cache))raw=await readFile(cache,'utf8');
   else{
    reserve(budget,day(),'list');await save('budget.json',budget);
    state.requests++;await publish();
    const url=new URL(LIST_ENDPOINT);
    for(const [k,v] of Object.entries({serviceKey:process.env.ONBID_API_KEY,pageNo:String(page),numOfRows:'100',resultType:'json',prptDivCd:PROPERTY_CODES,dspsMthodCd:'0001',bidDivCd:p.bid,pvctTrgtYn:p.privateContract,lctnSdnm:p.region}))url.searchParams.set(k,v);
    const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
    raw=await r.text();
    if([403,429].includes(r.status)){
     const paused=await read('access-paused.json',{});paused.list={day:day(),http:r.status,at:new Date().toISOString()};await save('access-paused.json',paused);throw Error(`HTTP_${r.status}`);
    }
    if(!r.ok)throw Error(`HTTP_${r.status}`);
    try{decode(raw);}catch(e){await writeFile(`${root}/last-failed-response.txt`,raw);if(/^API_(20|22|23|29|30|31)$/.test(e.message)){const paused=await read('access-paused.json',{});paused.list={day:day(),code:e.message,at:new Date().toISOString()};await save('access-paused.json',paused);}throw e;}
    await writeFile(cache,raw);
    await new Promise(r=>setTimeout(r,1100));
   }
   const e=decode(raw),rows=rowsOf(e),total=Number(e.body.totalCount),size=Number(e.body.numOfRows);
   if(Number(e.body.pageNo)!==page||size!==100||!Number.isSafeInteger(total)||total<0||(!rows.length&&(page-1)*size<total))throw Error('INCOMPLETE_PAGE');
   const hash=createHash('sha256').update(rows.map(identity).join('|')).digest('hex');
   if(rows.length&&Object.entries(state.completedPages).some(([key,v])=>key.startsWith(`${state.partition}-`)&&key!==pageKey&&v===hash))throw Error('REPEATED_PAGE');
   const accepted=rows.filter(scope);
   // A documented region filter returning another province must not silently count as complete.
   if(accepted.some(r=>r.lctnSdnm!==p.region))throw Error('REGION_FILTER_MISMATCH');
   for(const r of accepted)targets[identity(r)]=r;
   await save('targets.json',targets);
   const checkedAt=new Date().toISOString();
   const inputs=accepted.map(r=>({key:identity(r),checkedAt,input:toProperty(r)}));
   if(inputs.length){
    // Existing batch RPC delegates to the common atomic property upsert and accepts either source.
    const result=await db.rpc('upsert_court_batch',{p_items:inputs});
    if(result.error)throw Error(`DB_PROPERTIES_${result.error.code}`);
    const lookup=await db.from('properties').select('id,source_property_id,auction_condition_id').eq('source','onbid').in('auction_condition_id',accepted.map(r=>String(r.pbctCdtnNo))).in('source_property_id',accepted.map(r=>r.cltrMngNo));
    if(lookup.error)throw Error(`DB_LOOKUP_${lookup.error.code}`);
    const ids=new Map(lookup.data.map(r=>[`${r.source_property_id}:${r.auction_condition_id}`,r.id]));
    const observations=accepted.map(r=>({property_id:ids.get(identity(r)),observed_at:checkedAt,list_payload:r,detail_status:'permission_required'}));
    if(observations.some(r=>!r.property_id))throw Error('DB_IDENTITY_MISSING');
    const obs=await db.from('onbid_observations').upsert(observations,{onConflict:'property_id'});if(obs.error)throw Error(`DB_OBSERVATIONS_${obs.error.code}`);
    state.dbRows+=accepted.length;state.dbUpdatedAt=checkedAt;
   }
   if(!state.completedPages[pageKey]){state.rows+=rows.length;state.excluded+=rows.length-accepted.length;state.pages++;}
   state.completedPages[pageKey]=hash;state.partitionTotals[label]=total;
   state.current={...p,page};state.nextPage++;await publish();await event({type:'page_saved',pageKey,rows:rows.length,accepted:accepted.length,total,properties:state.properties,conditions:state.conditions});
   if(page*size>=total)break;
  }
 }
 state.status='list_completed';state.listFinishedAt=new Date().toISOString();state.detailStatus='permission_required';await publish();await event({type:'list_completed',properties:state.properties,conditions:state.conditions,dbRows:state.dbRows});
}catch(error){state.status=error.message==='STOP_PRESENT'?'stopped':error.message==='DAILY_BUDGET_EXHAUSTED'?'budget_wait':'failed';state.errors=[{at:new Date().toISOString(),code:error.message}];await publish();await event({type:'failure',code:error.message});process.exitCode=1;}
finally{await lock.close();await unlink(`${root}/running.lock`);console.log(JSON.stringify({status:state.status,pages:state.pages,properties:state.properties,conditions:state.conditions,dbRows:state.dbRows,errors:state.errors}));}
