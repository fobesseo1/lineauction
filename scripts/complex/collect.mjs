// Collect the capital-area K-APT complex master into public.complexes.
//   node scripts/complex/collect.mjs [--phase list|basis|detail|all] [--limit N] [--refresh-list]
// Every API response is cached under data/complex/raw, so reruns resume without re-calling
// and the DB can be rebuilt from cache. Basis and detail share one service quota per day.
import {mkdir,readFile,readdir,access,appendFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {LIST_ENDPOINT,BASIS_ENDPOINT,DETAIL_ENDPOINT,SIDO,LIST_PAGE_SIZE,decode,listItems,fromList,fromBasis,fromDetail} from './core.mjs';
process.loadEnvFile('.env.local');

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:fallback;};
const phase=arg('--phase','all');
const limit=Number(arg('--limit','0'))||Infinity;
const refreshList=process.argv.includes('--refresh-list');
if(!['list','basis','detail','all'].includes(phase))throw Error('INVALID_PHASE');

const root='data/complex';
const LIMITS={list:4800,basis:4800};      // dev account: 5,000 per service per day
const INTERVAL_MS=350;                    // the gateway rejects bursts with API_23 (per-second limit)
const MAX_CONSECUTIVE_ERRORS=5;
for(const d of ['raw/list','raw/basis','raw/detail'])await mkdir(`${root}/${d}`,{recursive:true});
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const readJson=async(p,fallback)=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}};
const event=data=>appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),...data})+'\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
let budget=await readJson(`${root}/budget.json`,{days:{}});

async function request(service,endpoint,params){
 if(await exists(`${root}/STOP`))throw Error('STOP_PRESENT');
 const used=budget.days[day()]??={list:0,basis:0};
 if(used[service]>=LIMITS[service])throw Error('DAILY_BUDGET_EXHAUSTED');
 used[service]++;await writeJson(`${root}/budget.json`,budget);
 const url=new URL(endpoint);
 for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,...params}))url.searchParams.set(k,v);
 // Every attempt waits, success or not, so an error never turns into a tight retry loop.
 for(let attempt=0;;attempt++){
  await sleep(INTERVAL_MS);
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
   const raw=await r.text();
   if(r.status>=500&&attempt<2){await sleep(1000*2**attempt);continue;}
   try{decode(raw);}      // throws API_xx so callers never cache an error envelope
   catch(e){
    if((e.message==='API_23'||r.status===429)&&attempt<3){await sleep(3000*2**attempt);continue;}
    throw e;
   }
   return raw;
  }catch(e){
   if(e.name==='TimeoutError'&&attempt<2){await sleep(1000*2**attempt);continue;}
   throw e;
  }
 }
}

async function upsert(rows){
 for(let i=0;i<rows.length;i+=500){
  const chunk=rows.slice(i,i+500).map(r=>({...r,updated_at:new Date().toISOString()}));
  const {error}=await db.from('complexes').upsert(chunk,{onConflict:'kapt_code'});
  if(error)throw Error(`DB_${error.code}:${error.message}`);
 }
}

// ---- list: all complexes per 시도. Cached per KST day so a refresh never reuses an old list.
async function collectList(){
 const listDay=refreshList?day():(await readJson(`${root}/list-day.json`,null))?.day??day();
 const dir=`${root}/raw/list/${listDay}`;await mkdir(dir,{recursive:true});
 for(const sido of Object.keys(SIDO)){
  for(let page=1;;page++){
   const file=`${dir}/${sido}-${page}.json`;
   let raw;
   if(await exists(file))raw=await readFile(file,'utf8');
   else{raw=await request('list',LIST_ENDPOINT,{sidoCode:sido,pageNo:String(page),numOfRows:String(LIST_PAGE_SIZE)});await writeJson(file,JSON.parse(raw));raw=await readFile(file,'utf8');}
   const body=decode(raw);
   if(page*LIST_PAGE_SIZE>=Number(body.totalCount))break;
  }
 }
 await writeJson(`${root}/list-day.json`,{day:listDay,completedAt:new Date().toISOString()});
 const rows=await listRows();
 await upsert([...rows.values()]);
 await event({phase:'list',day:listDay,complexes:rows.size});
 console.log(`LIST ${listDay}: ${rows.size} complexes`);
}

async function listRows(){
 const meta=await readJson(`${root}/list-day.json`,null);
 if(!meta)throw Error('LIST_NOT_COLLECTED');
 const dir=`${root}/raw/list/${meta.day}`;
 const rows=new Map();
 for(const f of (await readdir(dir)).sort()){
  const sido=f.split('-')[0];
  for(const item of listItems(decode(await readFile(`${dir}/${f}`,'utf8'))))rows.set(item.kaptCode,fromList(item,sido,meta.completedAt));
 }
 return rows;
}

// ---- basis / detail: one call per complex, cached forever per kapt code.
async function collectPer(kind){
 const endpoint=kind==='basis'?BASIS_ENDPOINT:DETAIL_ENDPOINT;
 const map=kind==='basis'?fromBasis:fromDetail;
 const list=await listRows();
 let fetched=0,stopped=null,consecutiveErrors=0;
 for(const kapt of list.keys()){
  if(fetched>=limit)break;
  const file=`${root}/raw/${kind}/${kapt}.json`;
  if(await exists(file))continue;
  try{
   const raw=await request('basis',endpoint,{kaptCode:kapt});
   const item=decode(raw).item;
   await writeJson(file,{fetchedAt:new Date().toISOString(),item:item??null});
   fetched++;consecutiveErrors=0;
   if(fetched%200===0)console.log(`${kind}: fetched ${fetched}`);
  }catch(e){
   if(['DAILY_BUDGET_EXHAUSTED','STOP_PRESENT','API_22','API_23','API_30'].includes(e.message)){stopped=e.message;break;}
   await event({phase:kind,kapt,error:e.message});
   // A run of failures means the service, not one complex, is the problem: stop and keep the quota.
   if(++consecutiveErrors>=MAX_CONSECUTIVE_ERRORS){stopped=`CONSECUTIVE_ERRORS:${e.message}`;break;}
  }
 }
 // Rebuild DB rows from every cached response (also picks up responses cached by earlier runs).
 // An upsert only overwrites the columns it sends, so detail rows send identity + detail columns
 // (name and sido are included only because the insert path checks NOT NULL before the conflict).
 const rows=[];
 for(const [kapt,base] of list){
  const cached=await readJson(`${root}/raw/${kind}/${kapt}.json`,null);
  if(!cached?.item)continue;
  const mapped=map(cached.item,cached.fetchedAt);
  if(kind==='basis')rows.push({...base,...mapped,name:mapped.name??base.name,bjd_code:mapped.bjd_code??base.bjd_code});
  else{
   const basis=await readJson(`${root}/raw/basis/${kapt}.json`,null);
   rows.push({kapt_code:kapt,sido:base.sido,name:basis?.item?.kaptName?.trim()||base.name,...mapped});
  }
 }
 await upsert(rows);
 const remaining=list.size-rows.length;
 await event({phase:kind,fetched,cachedRows:rows.length,remaining,stopped});
 console.log(`${kind.toUpperCase()}: fetched ${fetched} now, ${rows.length} in DB, ${remaining} remaining${stopped?` (stopped: ${stopped})`:''}`);
}

try{
 if(phase==='list'||phase==='all')await collectList();
 if(phase==='basis'||phase==='all')await collectPer('basis');
 if(phase==='detail'||phase==='all')await collectPer('detail');
}catch(e){
 await event({phase,fatal:e.message});
 console.error('FAILED',e.message);
 process.exitCode=1;
}
