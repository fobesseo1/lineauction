// Collect capital-area apartment/officetel trades (매매·전월세) into a local SQLite warehouse.
//   node scripts/molit/collect.mjs [--months 36] [--apis aptSale,aptRent,offiSale,offiRent]
// The warehouse (data/molit/warehouse.sqlite) is the full record; only summaries go to Supabase.
// A month is reloaded as a whole (delete + insert), so cancellations and corrections replace the
// earlier filing. Recent months are reloaded daily because late filings land there.
import {mkdir,readFile,access,appendFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {writeJson} from '../onbid/atomic.mjs';
import {regionCatalog} from '../court/regions.mjs';
import {APIS,leafRegions,monthsBack,decode,toRow} from './core.mjs';
import {singleRun} from '../single-run.mjs';
process.loadEnvFile('.env.local');

const arg=(name,fallback)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:fallback;};
const monthCount=Number(arg('--months','36'));
const apiNames=arg('--apis',Object.keys(APIS).join(',')).split(',');
if(apiNames.some(a=>!APIS[a]))throw Error('UNKNOWN_API');

const root='data/molit';await mkdir(root,{recursive:true});
if(!await singleRun(root,'scripts/molit/collect.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
// The court pipeline also spends apartment-sale calls every day, so that service keeps headroom.
const LIMITS={aptSale:5000,aptRent:9000,offiSale:9000,offiRent:9000,rhSale:9000,rhRent:9000,nrgSale:9000,landSale:9000,shSale:9000,shRent:9000};
const RECENT_MONTHS=3,INTERVAL_MS=500,MAX_CONSECUTIVE_ERRORS=5;
const day=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const exists=async p=>{try{await access(p);return true;}catch{return false;}};
const event=data=>appendFile(`${root}/events.jsonl`,JSON.stringify({at:new Date().toISOString(),...data})+'\n');
let budget;try{budget=JSON.parse(await readFile(`${root}/budget.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;budget={days:{}};}

const db=new DatabaseSync(`${root}/warehouse.sqlite`);
db.exec(`pragma journal_mode=wal;
create table if not exists trades(
 key text primary key, api text not null, kind text not null, deal text not null, lawd text not null, ym text not null,
 name text, umd text, jibun text, apt_seq text, building text, area real, floor integer, build_year integer,
 deal_date text, amount integer, deposit integer, monthly_rent integer, dealing text, cancel_date text, contract_type text, raw text);
create index if not exists trades_month on trades(api,lawd,ym);
create index if not exists trades_place on trades(lawd,umd,jibun,kind,deal);
create table if not exists month_loads(api text, lawd text, ym text, total integer, loaded_at text, primary key(api,lawd,ym));`);
// Columns added after the first warehouse build (빌라 land share, house type).
for(const col of ['land_area real','house_type text','building_area real','total_floor_area real','use_type text','building_type text','zone text','share text']){try{db.exec(`alter table trades add column ${col}`);}catch(e){if(!/duplicate column/.test(e.message))throw e;}}
const loadOf=db.prepare('select total,loaded_at from month_loads where api=? and lawd=? and ym=?');
const clearMonth=db.prepare('delete from trades where api=? and lawd=? and ym=?');
const insert=db.prepare(`insert into trades(key,api,kind,deal,lawd,ym,name,umd,jibun,apt_seq,building,area,floor,build_year,deal_date,amount,deposit,monthly_rent,dealing,cancel_date,contract_type,land_area,house_type,building_area,total_floor_area,use_type,building_type,zone,share,raw)
 values(:key,:api,:kind,:deal,:lawd,:ym,:name,:umd,:jibun,:apt_seq,:building,:area,:floor,:build_year,:deal_date,:amount,:deposit,:monthly_rent,:dealing,:cancel_date,:contract_type,:land_area,:house_type,:building_area,:total_floor_area,:use_type,:building_type,:zone,:share,:raw)`);
const recordLoad=db.prepare('insert or replace into month_loads(api,lawd,ym,total,loaded_at) values(?,?,?,?,?)');

async function call(apiName,params){
 if(await exists(`${root}/STOP`))throw Error('STOP_PRESENT');
 const used=budget.days[day()]??={};
 for(let attempt=0;;attempt++){
  if((used[apiName]??0)>=LIMITS[apiName])throw Error('DAILY_BUDGET_EXHAUSTED');
  used[apiName]=(used[apiName]??0)+1;await writeJson(`${root}/budget.json`,budget);
  await sleep(INTERVAL_MS);
  const url=new URL(APIS[apiName].url);
  for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,...params}))url.searchParams.set(k,v);
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(30000),redirect:'error'});
   const xml=await r.text();
   try{return decode(xml);}
   catch(e){
    if((e.message==='API_23'||r.status===429)&&attempt<3){await sleep(3000*2**attempt);continue;}
    if(['API_04','API_01','API_02','API_03'].includes(e.message)&&attempt<3){await sleep(30000*2**attempt);continue;}
    throw e;
   }
  }catch(e){
   if(['TimeoutError','TypeError'].includes(e.name)&&attempt<3){await sleep(5000*2**attempt);continue;}
   throw e;
  }
 }
}

async function loadMonth(apiName,lawd,ym){
 const rows=[];let total=null;
 for(let page=1;page<=50;page++){
  const res=await call(apiName,{LAWD_CD:lawd,DEAL_YMD:ym,pageNo:String(page),numOfRows:'1000'});
  if(total!==null&&res.total!==total)throw Error('TOTAL_CHANGED');
  total=res.total;rows.push(...res.rows);
  if(rows.length>=total||!res.rows.length)break;
 }
 if(rows.length!==total)throw Error(`INCOMPLETE_${rows.length}_OF_${total}`);
 // Identical filings in one month are separate trades: suffix the hash with its occurrence.
 const seen=new Map();
 const mapped=rows.map(item=>{const r=toRow(apiName,lawd,ym,item);const n=(seen.get(r.key)??0)+1;seen.set(r.key,n);return {...r,key:`${r.key}#${n}`};});
 db.exec('begin');
 try{clearMonth.run(apiName,lawd,ym);for(const r of mapped)insert.run(r);recordLoad.run(apiName,lawd,ym,total,new Date().toISOString());db.exec('commit');}
 catch(e){db.exec('rollback');throw e;}
 return total;
}

const regions=leafRegions(regionCatalog.codes);
const months=monthsBack(new Date(),monthCount);
const exhausted=new Set();let loaded=0,trades=0,consecutiveErrors=0,stopped=null;
console.log(`regions ${regions.length}, months ${months[months.length-1]}..${months[0]}, apis ${apiNames.join(',')}`);
outer:for(const [i,ym] of months.entries()){
 for(const {code} of regions){
  for(const apiName of apiNames){
   if(exhausted.has(apiName))continue;
   const prev=loadOf.get(apiName,code,ym);
   // Recent months count as fresh for 20 hours, not 24: a daily job that starts a little earlier
   // than yesterday's must still reload them, or the reload runs only every other day.
   const fresh=prev&&(i>=RECENT_MONTHS||Date.now()-Date.parse(prev.loaded_at)<20*3600000);
   if(fresh)continue;
   try{
    trades+=await loadMonth(apiName,code,ym);loaded++;consecutiveErrors=0;
    if(loaded%100===0)console.log(`loaded ${loaded} region-months (${ym}), ${trades} trades`);
   }catch(e){
    if(['DAILY_BUDGET_EXHAUSTED','API_22'].includes(e.message)){exhausted.add(apiName);await event({api:apiName,stopped:e.message});if(exhausted.size===apiNames.length){stopped='ALL_BUDGETS_EXHAUSTED';break outer;}continue;}
    // An API whose key is not approved (yet) is skipped; the others continue.
    if(['API_30','API_20'].includes(e.message)){exhausted.add(apiName);await event({api:apiName,stopped:e.message});if(exhausted.size===apiNames.length){stopped='ALL_APIS_UNAVAILABLE';break outer;}continue;}
    if(e.message==='STOP_PRESENT'){stopped=e.message;break outer;}
    await event({api:apiName,lawd:code,ym,error:e.message});
    if(++consecutiveErrors>=MAX_CONSECUTIVE_ERRORS){stopped=`CONSECUTIVE_ERRORS:${e.message}`;break outer;}
   }
  }
 }
}
const pending=db.prepare('select count(*) n from month_loads').get().n;
const total=db.prepare('select count(*) n from trades').get().n;
await event({phase:'run',loaded,trades,stopped,exhausted:[...exhausted],monthLoads:pending,warehouseTrades:total});
console.log(`DONE loaded ${loaded} region-months now; warehouse ${total} trades in ${pending} region-months${stopped?` (stopped: ${stopped})`:''}`);
db.close();
