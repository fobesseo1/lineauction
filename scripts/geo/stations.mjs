// 수도권 전철역 from OpenStreetMap (Overpass) → public.rail_stations, then each complex's nearest two.
//   node scripts/geo/stations.mjs [--refresh]
// The Overpass answer is cached in data/stations/raw/overpass.json and refetched when older than
// 7 days (or with --refresh); the nearest-station pass is local and writes only changed complexes.
import {mkdir,readFile,stat} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {OVERPASS_URL,OVERPASS_QUERY,buildStations,nearestStations} from './stations-core.mjs';
process.loadEnvFile('.env.local');

const root='data/stations';await mkdir(`${root}/raw`,{recursive:true});
if(!await singleRun(root,'scripts/geo/stations.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const cache=`${root}/raw/overpass.json`;
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ageDays=async p=>{try{return (Date.now()-(await stat(p)).mtimeMs)/86400_000;}catch(e){if(e.code==='ENOENT')return Infinity;throw e;}};

async function fetchOverpass(){
 for(let attempt=0;;attempt++){
  try{
   // overpass-api.de answers 406 to requests without a User-Agent.
   const r=await fetch(OVERPASS_URL,{method:'POST',headers:{'user-agent':'lineestate-data-factory/1.0','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:OVERPASS_QUERY}),signal:AbortSignal.timeout(200_000)});
   const text=await r.text();
   if(!r.ok)throw Error(`OVERPASS_${r.status}`);
   const json=JSON.parse(text);
   if(!json.elements?.length)throw Error('OVERPASS_EMPTY');
   return json;
  }catch(e){if(attempt>=2)throw e;await sleep(60_000*(attempt+1));}
 }
}

async function fetchAll(table,columns){
 const out=[];
 for(let from=0;;from+=1000){const {data,error}=await supa.from(table).select(columns).order('id').range(from,from+999);if(error)throw Error(`${table}: ${error.message}`);out.push(...data);if(data.length<1000)break;}
 return out;
}
async function write(table,rows,onConflict){
 for(let i=0;i<rows.length;i+=500){
  for(let attempt=1;;attempt++){
   const {error}=await supa.from(table).upsert(rows.slice(i,i+500),{onConflict});
   if(!error)break;
   if(attempt>=3)throw Error(`DB_${error.code}:${error.message}`);
   await sleep(5000*attempt);
  }
 }
}

try{
 let refreshed=false;
 if(process.argv.includes('--refresh')||await ageDays(cache)>7){await writeJson(cache,await fetchOverpass());refreshed=true;}
 const osm=JSON.parse(await readFile(cache,'utf8'));
 const {stations,unmatchedStops}=buildStations(osm.elements);
 // A broken answer must never empty the table: the capital area has 600+ stations.
 if(stations.length<500)throw Error(`TOO_FEW_STATIONS:${stations.length}`);
 if(refreshed){
  const now=new Date().toISOString();
  await write('rail_stations',stations.map(({points,...s})=>({...s,updated_at:now})),'id');
  const keep=new Set(stations.map(s=>s.id));
  const gone=(await fetchAll('rail_stations','id')).map(r=>r.id).filter(id=>!keep.has(id));
  for(let i=0;i<gone.length;i+=200){const {error}=await supa.from('rail_stations').delete().in('id',gone.slice(i,i+200));if(error)throw Error(`DB_${error.code}:${error.message}`);}
 }
 const cols=['nearest_station_name','nearest_station_lines','nearest_station_m','nearest_station_walk_min','second_station_name','second_station_lines','second_station_m','second_station_walk_min'];
 const complexes=await fetchAll('complexes',`id,kapt_code,name,sido,latitude,longitude,${cols.join(',')}`);
 const now=new Date().toISOString();const changed=[];
 for(const c of complexes){
  // id is GENERATED ALWAYS, so rows are matched on kapt_code (every complex has one today).
  if(c.latitude==null||c.longitude==null||!c.kapt_code)continue;
  const next=nearestStations({lat:c.latitude,lon:c.longitude},stations);
  if(cols.every(k=>JSON.stringify(c[k])===JSON.stringify(next[k])))continue;
  // name and sido ride along only because the insert path checks NOT NULL before the conflict.
  changed.push({kapt_code:c.kapt_code,name:c.name,sido:c.sido,...next,stations_computed_at:now});
 }
 await write('complexes',changed,'kapt_code');
 console.log(`STATIONS ${stations.length}${refreshed?' (refreshed)':''}, unmatched stops ${unmatchedStops}; complexes updated ${changed.length}`);
}catch(e){
 console.error('FAILED',e.message);
 process.exitCode=1;
}
