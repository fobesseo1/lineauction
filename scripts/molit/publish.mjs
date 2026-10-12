// Rebuild the Supabase market_* summary tables from the local trade warehouse.
//   node scripts/molit/publish.mjs [--dry-run]
// Rows are upserted with this run's refreshed_at, then rows from earlier runs are deleted,
// so screens never see an empty table mid-run.
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {regionCatalog} from '../court/regions.mjs';
import {leafRegions} from './core.mjs';
import {placeId,jibunPnu,areaStats,periodStart,normalizeName,monthlyHistory} from './summary.mjs';
process.loadEnvFile('.env.local');

const dryRun=process.argv.includes('--dry-run');
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
  where umd is not null and jibun is not null group by kind,lawd,umd,jibun,name`).iterate()){
 const id=placeId(r.kind,r.lawd,r.umd,r.jibun);
 const prev=places.get(id);
 if(prev&&prev._d>=r.d)continue;
 const [sido,...rest]=(regionName.get(r.lawd)??'').split(' ');
 const bjd=bjdByDong.get(`${r.lawd}:${r.umd}`)??null;
 const pnu=jibunPnu(bjd,r.jibun);
 places.set(id,{id,kind:r.kind,lawd:r.lawd,sido:sido||null,sigungu:rest.join(' ')||null,umd:r.umd,jibun:r.jibun,bjd_code:bjd,pnu,
  name:r.name,build_year:r.build_year,kapt_code:r.kind==='apt'?(pnu&&kaptByPnu.get(pnu))||(bjd&&kaptByName.get(`${bjd}:${normalizeName(r.name)}`))||null:null,refreshed_at:runAt,_d:r.d});
}

// Stats and recent sales over the last 12 months, streamed in building+area order.
const stats=[],sales=[];
let group=[],groupKey=null;
const flush=()=>{if(!group.length)return;const [pid,areaType]=groupKey.split('|');
 stats.push({place_id:pid,area_type:Number(areaType),...areaStats(group),history:null,period_start:start,period_end:end,refreshed_at:runAt});group=[];};
for(const t of wh.prepare(`select key,kind,lawd,umd,jibun,area,floor,building,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date
  from trades where deal_date>=? and umd is not null and jibun is not null and area is not null order by kind,lawd,umd,jibun,cast(area as integer)`).iterate(start)){
 const pid=placeId(t.kind,t.lawd,t.umd,t.jibun),areaType=Math.floor(t.area),key=`${pid}|${areaType}`;
 if(key!==groupKey){flush();groupKey=key;}
 group.push(t);
 if(t.deal==='sale'&&t.amount!=null)sales.push({id:t.key,place_id:pid,area:t.area,area_type:areaType,floor:t.floor,building:t.building,deal_date:t.deal_date,amount:t.amount,direct:t.dealing==='직거래',cancelled:!!t.cancel_date});
}
flush();

// 36-month chart history per building+평형, attached to the stats rows that exist.
const months=Array.from({length:36},(_,i)=>{const d=new Date(Date.now()+9*3600000);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-35+i);return d.toISOString().slice(0,7);});
const statByKey=new Map(stats.map(r=>[`${r.place_id}|${r.area_type}`,r]));
let hGroup=[],hKey=null;
const hFlush=()=>{const row=statByKey.get(hKey);if(row&&hGroup.length)row.history=monthlyHistory(hGroup,months);hGroup=[];};
for(const t of wh.prepare(`select kind,lawd,umd,jibun,area,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date
  from trades where deal_date>=? and umd is not null and jibun is not null and area is not null order by kind,lawd,umd,jibun,cast(area as integer)`).iterate(`${months[0]}-01`)){
 const key=`${placeId(t.kind,t.lawd,t.umd,t.jibun)}|${Math.floor(t.area)}`;
 if(key!==hKey){hFlush();hKey=key;}
 hGroup.push(t);
}
hFlush();

const placeRows=[...places.values()].map(({_d,...p})=>p);
const matched=placeRows.filter(p=>p.kapt_code).length;
console.log(`places ${placeRows.length} (K-APT matched ${matched} of ${placeRows.filter(p=>p.kind==='apt').length} apt), area stats ${stats.length}, sales ${sales.length}, period ${start}..${end}`);
if(dryRun){wh.close();process.exit(0);}

async function upsert(table,rows,onConflict){
 for(let i=0;i<rows.length;i+=1000){
  const {error}=await supa.from(table).upsert(rows.slice(i,i+1000),{onConflict});
  if(error)throw Error(`${table}: ${error.message}`);
 }
}
await upsert('market_places',placeRows,'id');
await upsert('market_area_stats',stats,'place_id,area_type');

// Sales are immutable (id = content hash), so sync them by difference: rewriting 300k unchanged
// rows every run only bloats the free-tier DB.
const existing=new Set();
for(let after='';;){
 const {data,error}=await supa.from('market_trades').select('id').gt('id',after).order('id').limit(1000);
 if(error)throw Error(`market_trades ids: ${error.message}`);
 for(const r of data)existing.add(r.id);
 if(data.length<1000)break;after=data.at(-1).id;
}
const current=new Set(sales.map(s=>s.id));
const added=sales.filter(s=>!existing.has(s.id)),gone=[...existing].filter(id=>!current.has(id));
for(let i=0;i<added.length;i+=1000){const {error}=await supa.from('market_trades').insert(added.slice(i,i+1000));if(error)throw Error(`market_trades insert: ${error.message}`);}
for(let i=0;i<gone.length;i+=300){const {error}=await supa.from('market_trades').delete().in('id',gone.slice(i,i+300));if(error)throw Error(`market_trades delete: ${error.message}`);}
console.log(`market_trades: +${added.length} -${gone.length}`);

// Places and stats are rewritten each run; delete what an earlier run left behind, a page at a time.
const keys={market_area_stats:['place_id','area_type'],market_places:['id']};
for(const [table,cols] of Object.entries(keys)){
 let removed=0;
 for(;;){
  const {data,error}=await supa.from(table).select(cols.join(',')).lt('refreshed_at',runAt).limit(500);
  if(error)throw Error(`${table} cleanup: ${error.message}`);
  if(!data.length)break;
  const del=cols.length===1
   ?supa.from(table).delete().in(cols[0],data.map(r=>r[cols[0]]))
   :supa.from(table).delete().or(data.map(r=>`and(place_id.eq."${r.place_id}",area_type.eq.${r.area_type})`).join(','));
  const {error:delError}=await del;
  if(delError)throw Error(`${table} cleanup: ${delError.message}`);
  removed+=data.length;
 }
 if(removed)console.log(`${table}: removed ${removed} stale rows`);
}
console.log('PUBLISHED');
wh.close();
