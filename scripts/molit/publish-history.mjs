// One-off: publish apartment 매매·전월세 from HISTORY_FROM (2019-01) up to the rolling windows of
// publish.mjs into market_trades / market_rents, for the lineestate backtest.
//   node scripts/molit/collect.mjs --months 95 --apis aptSale,aptRent   (warehouse, 1-2 days of quota)
//   node scripts/molit/publish.mjs --with-villas                         (places for history-only buildings)
//   node scripts/molit/publish-history.mjs [--dry-run]
// Rows are inserted month by month with ignoreDuplicates (ids are warehouse keys), so a rerun
// resumes; months already published are listed in data/molit/history-progress.json.
// publish.mjs keeps these rows (it no longer expires apartment rows from HISTORY_FROM on).
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {placeId,periodStart,HISTORY_FROM,saleRow,rentRow} from './summary.mjs';
process.loadEnvFile('.env.local');

const dryRun=process.argv.includes('--dry-run');
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});
const progressPath='data/molit/history-progress.json';
let progress;try{progress=JSON.parse(await readFile(progressPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;progress={};}

// Window starts as publish.mjs computes them: sales keep 36 months, rents 12 months.
const now=new Date(Date.now()+9*3600000);
const salesStart=(()=>{const d=new Date(now);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-35);return d.toISOString().slice(0,10);})();
const rentsStart=periodStart(new Date());

// Every place must exist first (foreign key); publish.mjs creates them.
const known=new Set();
for(let after='';;){
 const {data,error}=await supa.from('market_places').select('id').eq('kind','apt').gt('id',after).order('id').limit(1000);
 if(error)throw Error(`places: ${error.message}`);
 for(const r of data)known.add(r.id);
 if(data.length<1000)break;after=data.at(-1).id;
}

const months=[];
for(let d=new Date(`${HISTORY_FROM}T00:00:00Z`);d.toISOString().slice(0,10)<rentsStart;d.setUTCMonth(d.getUTCMonth()+1))months.push(d.toISOString().slice(0,7));
const rowsOf=wh.prepare(`select key,lawd,umd,jibun,area,floor,building,deal_date,amount,deposit,monthly_rent,dealing,cancel_date,contract_type
 from trades where kind='apt' and deal=? and deal_date>=? and deal_date<? and umd is not null and jibun is not null and area is not null`);

async function insert(table,rows){
 for(let i=0;i<rows.length;i+=1000){
  for(let attempt=1;;attempt++){
   const {error}=await supa.from(table).upsert(rows.slice(i,i+1000),{onConflict:'id',ignoreDuplicates:true});
   if(!error)break;
   if(attempt>=3)throw Error(`${table} insert: ${error.message}`);
   await new Promise(r=>setTimeout(r,5000*attempt));
  }
 }
}

for(const [table,deal,windowStart,toRow] of [['market_trades','sale',salesStart,saleRow],['market_rents','rent',rentsStart,rentRow]]){
 const done=new Set(progress[table]??[]);
 let total=0,missingPlace=0;
 for(const ym of months){
  const from=`${ym}-01`;
  if(from>=windowStart||done.has(ym))continue;
  const next=new Date(`${from}T00:00:00Z`);next.setUTCMonth(next.getUTCMonth()+1);
  const to=[next.toISOString().slice(0,10),windowStart].sort()[0];
  const rows=[];
  for(const t of rowsOf.iterate(deal,from,to)){
   if(deal==='sale'&&t.amount==null)continue;
   const pid=placeId('apt',t.lawd,t.umd,t.jibun);
   if(!known.has(pid)){missingPlace++;continue;}
   rows.push(toRow(t,pid));
  }
  total+=rows.length;
  if(dryRun){console.log(`${table} ${ym} ${rows.length}`);continue;}
  await insert(table,rows);
  // A month that ends at the window start is partial; it is finished by the daily publish.
  if(to!==windowStart){done.add(ym);progress[table]=[...done].sort();await writeJson(progressPath,progress);}
  console.log(`${table} ${ym} +${rows.length}`);
 }
 console.log(`${table}: ${total} rows below ${windowStart}, ${missingPlace} skipped without a place`);
}
console.log(dryRun?'DRY_RUN':'PUBLISHED_HISTORY');
wh.close();
