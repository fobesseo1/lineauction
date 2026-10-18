// Rebuild the Supabase market_* summary tables from the local trade warehouse.
//   node scripts/molit/publish.mjs [--dry-run]
// Only new or changed rows are written (content digest) and vanished rows deleted,
// so screens never see an empty table mid-run.
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {regionCatalog} from '../court/regions.mjs';
import {leafRegions} from './core.mjs';
import {placeId,jibunPnu,areaStats,periodStart,normalizeName,monthlyHistory} from './summary.mjs';
process.loadEnvFile('.env.local');

const dryRun=process.argv.includes('--dry-run');
// 빌라 buildings (kind 'rh') are published only with --with-villas until lineestate filters every
// market_places read by kind; then the daily job turns it on.
const KINDS=process.argv.includes('--with-villas')?"'apt','offi','rh'":"'apt','offi'";
const runAt=new Date().toISOString();
const start=periodStart(new Date());
const end=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});

// 법정동 code and K-APT complex lookups from public.complexes.
// A complex is matched by lot (PNU) first, then by the same 법정동 and normalized name, which
// also covers complexes whose detail (and so PNU) is not collected yet.
const bjdByDong=new Map(),kaptByPnu=new Map(),kaptByName=new Map();
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('complexes').select('kapt_code,bjd_code,dong,pnu,name').order('id').range(from,from+999);
 if(error)throw Error(error.message);
 for(const c of data){
  if(c.bjd_code&&c.dong)bjdByDong.set(`${c.bjd_code.slice(0,5)}:${c.dong}`,c.bjd_code);
  if(c.pnu&&!kaptByPnu.has(c.pnu))kaptByPnu.set(c.pnu,c.kapt_code);
  const key=`${c.bjd_code}:${normalizeName(c.name)}`;
  kaptByName.set(key,kaptByName.has(key)?null:c.kapt_code);   // ambiguous names never match
 }
 if(data.length<1000)break;
}
// The vworld 법정동 table (scripts/geo/dongs.mjs) is the main source; K-APT dong names fill gaps.
try{for(const [lawd,map] of Object.entries(JSON.parse(await readFile('data/geo/dongs.json','utf8')).table))for(const [umd,bjd] of Object.entries(map))bjdByDong.set(`${lawd}:${umd}`,bjd);}catch(e){if(e.code!=='ENOENT')throw e;}
const regionName=new Map(leafRegions(regionCatalog.codes).map(r=>[r.code,r.name]));

// Places: every building with any trade in the warehouse; name/build year from its latest trade.
const places=new Map();
for(const r of wh.prepare(`select kind,lawd,umd,jibun,name,build_year,max(deal_date) d from trades
  where kind in (${KINDS}) and umd is not null and jibun is not null group by kind,lawd,umd,jibun,name`).iterate()){
 const id=placeId(r.kind,r.lawd,r.umd,r.jibun);
 const prev=places.get(id);
 if(prev&&prev._d>=r.d)continue;
 const [sido,...rest]=(regionName.get(r.lawd)??'').split(' ');
 const bjd=bjdByDong.get(`${r.lawd}:${r.umd}`)??null;
 const pnu=jibunPnu(bjd,r.jibun);
 places.set(id,{id,kind:r.kind,lawd:r.lawd,sido:sido||null,sigungu:rest.join(' ')||null,umd:r.umd,jibun:r.jibun,bjd_code:bjd,pnu,
  name:r.name,build_year:r.build_year,kapt_code:r.kind==='apt'?(pnu&&kaptByPnu.get(pnu))||(bjd&&kaptByName.get(`${bjd}:${normalizeName(r.name)}`))||null:null,refreshed_at:runAt,_d:r.d});
}

// Stats and 전월세 contracts over the last 12 months, streamed in building+area order.
const stats=[],sales=[],rents=[];
let group=[],groupKey=null;
const flush=()=>{if(!group.length)return;const [pid,areaType]=groupKey.split('|');
 // kind and region copied from the place so screens can filter without a join.
 const place=places.get(pid);
 stats.push({place_id:pid,area_type:Number(areaType),kind:place?.kind??null,sido:place?.sido??null,sigungu:place?.sigungu??null,...areaStats(group),history:null,period_start:start,period_end:end,refreshed_at:runAt});group=[];};
for(const t of wh.prepare(`select key,kind,lawd,umd,jibun,area,floor,building,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date,contract_type
  from trades where kind in (${KINDS}) and deal_date>=? and umd is not null and jibun is not null and area is not null order by kind,lawd,umd,jibun,cast(area as integer)`).iterate(start)){
 const pid=placeId(t.kind,t.lawd,t.umd,t.jibun),areaType=Math.floor(t.area),key=`${pid}|${areaType}`;
 if(key!==groupKey){flush();groupKey=key;}
 group.push(t);
 if(t.deal==='rent')rents.push({id:t.key,place_id:pid,area:t.area,area_type:areaType,floor:t.floor,deal_date:t.deal_date,deposit:t.deposit,monthly_rent:t.monthly_rent??0,contract_type:t.contract_type||null,cancelled:!!t.cancel_date});
}
flush();

// 36-month chart history per building+평형, attached to the stats rows that exist.
const months=Array.from({length:36},(_,i)=>{const d=new Date(Date.now()+9*3600000);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-35+i);return d.toISOString().slice(0,7);});
const statByKey=new Map(stats.map(r=>[`${r.place_id}|${r.area_type}`,r]));
let hGroup=[],hKey=null;
const hFlush=()=>{const row=statByKey.get(hKey);if(row&&hGroup.length)row.history=monthlyHistory(hGroup,months);hGroup=[];};
for(const t of wh.prepare(`select key,kind,lawd,umd,jibun,area,floor,building,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date
  from trades where kind in (${KINDS}) and deal_date>=? and umd is not null and jibun is not null and area is not null order by kind,lawd,umd,jibun,cast(area as integer)`).iterate(`${months[0]}-01`)){
 const key=`${placeId(t.kind,t.lawd,t.umd,t.jibun)}|${Math.floor(t.area)}`;
 if(key!==hKey){hFlush();hKey=key;}
 hGroup.push(t);
 // Sales list: the same 36 months as the chart.
 if(t.deal==='sale'&&t.amount!=null)sales.push({id:t.key,place_id:key.split('|')[0],area:t.area,area_type:Math.floor(t.area),floor:t.floor,building:t.building,deal_date:t.deal_date,amount:t.amount,direct:t.dealing==='직거래',cancelled:!!t.cancel_date});
}
hFlush();

// 토지·상업업무용·단독다가구 sales (36 months), by 법정동; MOLIT masks most of their lot numbers.
const COMMERCIAL_KIND={land:'land',nrg:'commercial',sh:'house'};
const commercial=[];
for(const t of wh.prepare(`select key,kind,lawd,umd,jibun,use_type,house_type,zone,land_area,building_area,total_floor_area,floor,build_year,building_type,share,deal_date,amount,dealing,cancel_date
  from trades where kind in ('land','nrg','sh') and deal='sale' and deal_date>=? and amount is not null`).iterate(`${months[0]}-01`)){
 const [sido,...rest]=(regionName.get(t.lawd)??'').split(' ');
 commercial.push({id:t.key,kind:COMMERCIAL_KIND[t.kind],lawd:t.lawd,sido:sido||null,sigungu:rest.join(' ')||null,umd:t.umd,jibun:t.jibun,
  use_type:t.use_type||t.house_type||null,zone:t.zone||null,land_area:t.land_area,building_area:t.building_area,total_floor_area:t.total_floor_area,
  floor:t.floor,build_year:t.build_year,building_type:t.building_type||null,share:t.share==='지분',deal_date:t.deal_date,amount:t.amount,
  direct:t.dealing==='직거래',cancelled:!!t.cancel_date});
}

const placeRows=[...places.values()].map(({_d,...p})=>p);
const matched=placeRows.filter(p=>p.kapt_code).length;
console.log(`places ${placeRows.length} (K-APT matched ${matched} of ${placeRows.filter(p=>p.kind==='apt').length} apt), area stats ${stats.length}, sales ${sales.length}, rents ${rents.length}, commercial ${commercial.length}, period ${start}..${end}`);
if(dryRun){wh.close();process.exit(0);}

// Batches of 500 with up to 3 tries: a busy free-tier DB occasionally times out one batch.
async function upsert(table,rows,onConflict){
 for(let i=0;i<rows.length;i+=500){
  for(let attempt=1;;attempt++){
   const {error}=await supa.from(table).upsert(rows.slice(i,i+500),{onConflict});
   if(!error)break;
   if(attempt>=3)throw Error(`${table}: ${error.message}`);
   await new Promise(r=>setTimeout(r,5000*attempt));
  }
 }
}
// Places and stats change little from day to day, so only new or changed rows are written
// (compared by a content digest) and rows that disappeared are deleted. Rewriting every row
// daily doubled these tables on the free-tier DB.
// The rolling window dates change daily for every row, so they stay out of the digest.
const digestOf=row=>{const {refreshed_at:_r,period_start:_s,period_end:_e,...rest}=row;return createHash('sha1').update(JSON.stringify(rest)).digest('hex').slice(0,16);};
async function existingDigests(table,cols){
 const out=new Map();
 for(let from=0;;from+=1000){
  const {data,error}=await supa.from(table).select([...cols,'digest'].join(',')).order(cols[0]).order(cols.at(-1)).range(from,from+999);
  if(error)throw Error(`${table} digests: ${error.message}`);
  for(const r of data)out.set(cols.map(c=>r[c]).join('|'),r.digest);
  if(data.length<1000)break;
 }
 return out;
}
// What was last published is kept locally, so a daily run doesn't read ~430k digests back from the
// DB just to compare; --full (or a missing cache file) reads them from the DB instead.
const digestCachePath=table=>`data/molit/published-${table}.json`;
async function knownDigests(table,cols){
 if(!process.argv.includes('--full')){try{return new Map(Object.entries(JSON.parse(await readFile(digestCachePath(table),'utf8'))));}catch(e){if(e.code!=='ENOENT')throw e;}}
 return existingDigests(table,cols);
}
async function syncTable(table,rows,cols){
 const have=await knownDigests(table,cols);
 const keyOf=r=>cols.map(c=>r[c]).join('|');
 const changed=rows.map(r=>({...r,digest:digestOf(r)})).filter(r=>have.get(keyOf(r))!==r.digest);
 await upsert(table,changed,cols.join(','));
 const current=new Set(rows.map(keyOf));
 const gone=[...have.keys()].filter(k=>!current.has(k));
 for(let i=0;i<gone.length;i+=200){
  const batch=gone.slice(i,i+200).map(k=>k.split('|'));
  const del=cols.length===1?supa.from(table).delete().in(cols[0],batch.map(b=>b[0]))
   :supa.from(table).delete().or(batch.map(([pid,t])=>`and(place_id.eq."${pid}",area_type.eq.${t})`).join(','));
  const {error}=await del;if(error)throw Error(`${table} delete: ${error.message}`);
 }
 await writeJson(digestCachePath(table),Object.fromEntries(rows.map(r=>[keyOf(r),digestOf(r)])));
 console.log(`${table}: ${changed.length} written, ${gone.length} removed, ${rows.length-changed.length} unchanged`);
}
await syncTable('market_places',placeRows,['id']);
await syncTable('market_area_stats',stats,['place_id','area_type']);
{const {error}=await supa.from('market_summary_meta').upsert({id:1,published_at:runAt,period_start:start,period_end:end});if(error)throw Error(`meta: ${error.message}`);}

// Trade rows are immutable (id = content hash), so they are synced by difference. Daily runs only
// compare the months MOLIT reloads (recent RECHECK_MONTHS) and drop rows that left the window;
// --full compares everything (first load, or after changing a window).
const full=process.argv.includes('--full');
const RECHECK_MONTHS=3;   // MOLIT reloads at most the last 3 months
const recheckFrom=(()=>{const d=new Date(Date.now()+9*3600000);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-RECHECK_MONTHS);return d.toISOString().slice(0,10);})();
async function syncById(table,rows,windowStart){
 const from=full?windowStart:recheckFrom;
 const existing=new Set();
 for(let after='';;){
  const {data,error}=await supa.from(table).select('id').gte('deal_date',from).gt('id',after).order('id').limit(1000);
  if(error)throw Error(`${table} ids: ${error.message}`);
  for(const r of data)existing.add(r.id);
  if(data.length<1000)break;after=data.at(-1).id;
 }
 const mine=rows.filter(r=>r.deal_date>=from);
 const current=new Set(mine.map(r=>r.id));
 const added=mine.filter(r=>!existing.has(r.id)),gone=[...existing].filter(id=>!current.has(id));
 for(let i=0;i<added.length;i+=1000){
  for(let attempt=1;;attempt++){
   const {error}=await supa.from(table).upsert(added.slice(i,i+1000),{onConflict:'id',ignoreDuplicates:true});
   if(!error)break;
   if(attempt>=3)throw Error(`${table} insert: ${error.message}`);
   await new Promise(r=>setTimeout(r,5000*attempt));
  }
 }
 for(let i=0;i<gone.length;i+=300){const {error}=await supa.from(table).delete().in('id',gone.slice(i,i+300));if(error)throw Error(`${table} delete: ${error.message}`);}
 const {error,count}=await supa.from(table).delete({count:'exact'}).lt('deal_date',windowStart);if(error)throw Error(`${table} expire: ${error.message}`);
 console.log(`${table}: +${added.length} -${gone.length} expired ${count??0}`);
}
const salesStart=`${months[0]}-01`;
await syncById('market_trades',sales,salesStart);
await syncById('market_rents',rents,start);
await syncById('market_commercial_trades',commercial,salesStart);

console.log('PUBLISHED');
wh.close();
