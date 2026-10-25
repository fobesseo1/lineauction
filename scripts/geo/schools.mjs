// 초등학교 통학구역 (vworld) + 학교 위치 (OpenStreetMap) → public.elementary_zones / elementary_schools,
// then each complex's 배정 초등학교 and distance.
//   node scripts/geo/schools.mjs [--refresh]
// Sources are cached in data/schools/raw and refetched when older than 30 days (학구도 changes yearly);
// the assignment pass is local and writes only changed complexes.
import {mkdir,readFile,stat} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {allFeatures} from './vworld.mjs';
import {OVERPASS_URL} from './stations-core.mjs';
import {ZONE_LAYER,BBOX,SCHOOL_TILES,schoolQuery,osmSchools,buildZones,assignSchool} from './schools-core.mjs';
process.loadEnvFile('.env.local');

const root='data/schools';await mkdir(`${root}/raw`,{recursive:true});
if(!await singleRun(root,'scripts/geo/schools.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const zonesPath=`${root}/raw/zones.json`,tilePath=i=>`${root}/raw/tile${i+1}.json`;
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ageDays=async p=>{try{return (Date.now()-(await stat(p)).mtimeMs)/86400_000;}catch(e){if(e.code==='ENOENT')return Infinity;throw e;}};
const [x0,y0,x1,y1]=(()=>{const [s,w,n,e]=BBOX.split(',');return [w,s,e,n];})();

async function overpass(query){
 for(let attempt=0;;attempt++){
  try{
   const r=await fetch(OVERPASS_URL,{method:'POST',headers:{'user-agent':'lineestate-data-factory/1.0','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(200_000)});
   const text=await r.text();
   if(!r.ok)throw Error(`OVERPASS_${r.status}`);
   return JSON.parse(text);
  }catch(e){if(attempt>=3)throw e;await sleep(30_000*(attempt+1));}
 }
}
async function fetchAll(table,columns){
 const out=[];
 for(let from=0;;from+=1000){const {data,error}=await supa.from(table).select(columns).order('id').range(from,from+999);if(error)throw Error(`${table}: ${error.message}`);out.push(...data);if(data.length<1000)break;}
 return out;
}
async function write(table,rows,onConflict,size=500){
 for(let i=0;i<rows.length;i+=size){
  for(let attempt=1;;attempt++){
   const {error}=await supa.from(table).upsert(rows.slice(i,i+size),{onConflict});
   if(!error)break;
   if(attempt>=3)throw Error(`DB_${error.code}:${error.message}`);
   await sleep(5000*attempt);
  }
 }
}
async function replace(table,rows,size){
 await write(table,rows,'id',size);
 const keep=new Set(rows.map(r=>r.id));
 const gone=(await fetchAll(table,'id')).map(r=>r.id).filter(id=>!keep.has(id));
 for(let i=0;i<gone.length;i+=200){const {error}=await supa.from(table).delete().in('id',gone.slice(i,i+200));if(error)throw Error(`DB_${error.code}:${error.message}`);}
}
const round6=g=>JSON.parse(JSON.stringify(g,(k,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v));

try{
 const refresh=process.argv.includes('--refresh');
 let refreshed=false;
 if(refresh||await ageDays(zonesPath)>30){
  await writeJson(zonesPath,{fetchedAt:new Date().toISOString(),features:await allFeatures(ZONE_LAYER,{geomFilter:`BOX(${x0},${y0},${x1},${y1})`})});
  refreshed=true;
 }
 for(const [i,tile] of SCHOOL_TILES.entries())if(refresh||refreshed||await ageDays(tilePath(i))>30){await writeJson(tilePath(i),await overpass(schoolQuery(tile)));refreshed=true;await sleep(5000);}
 const features=JSON.parse(await readFile(zonesPath,'utf8')).features;
 const elements=[];for(let i=0;i<SCHOOL_TILES.length;i++)elements.push(...JSON.parse(await readFile(tilePath(i),'utf8')).elements);
 const zones=buildZones(features,osmSchools(elements));
 // A broken answer must never empty the tables: the capital area has ~2,600 zones.
 if(zones.length<2000)throw Error(`TOO_FEW_ZONES:${zones.length}`);
 const now=new Date().toISOString();
 // Tables are rewritten after a refetch, or when empty (first run on caches fetched by hand).
 const {count,error}=await supa.from('elementary_zones').select('id',{count:'exact',head:true});
 if(error)throw Error(`DB_${error.code}:${error.message}`);
 if(refreshed||!count){
  await replace('elementary_zones',zones.map(z=>({id:z.id,name:z.name,shared:z.shared,school_names:z.schools.map(s=>s.name),base_dt:z.base_dt||null,geometry:round6(z.geometry),updated_at:now})),50);
  const schools=new Map();
  for(const z of zones)for(const s of z.schools)if(s.osm_id){const p=schools.get(s.osm_id)??{id:s.osm_id,name:s.name,latitude:s.lat,longitude:s.lon,zone_ids:[],updated_at:now};p.zone_ids.push(z.id);schools.set(s.osm_id,p);}
  await replace('elementary_schools',[...schools.values()],500);
 }
 const cols=['elementary_school','elementary_school_m','elementary_zone_id','elementary_zone_shared','elementary_zone_schools'];
 const complexes=await fetchAll('complexes',`id,kapt_code,name,sido,latitude,longitude,${cols.join(',')}`);
 const changed=[];let assigned=0;
 for(const c of complexes){
  // id is GENERATED ALWAYS, so rows are matched on kapt_code (every complex has one today).
  if(c.latitude==null||c.longitude==null||!c.kapt_code)continue;
  const next=assignSchool({lat:c.latitude,lon:c.longitude},zones)??Object.fromEntries(cols.map(k=>[k,null]));
  if(next.elementary_school)assigned++;
  if(cols.every(k=>JSON.stringify(c[k])===JSON.stringify(next[k])))continue;
  changed.push({kapt_code:c.kapt_code,name:c.name,sido:c.sido,...next,elementary_computed_at:now});
 }
 await write('complexes',changed,'kapt_code');
 console.log(`ZONES ${zones.length}${refreshed?' (refreshed)':''}; complexes assigned ${assigned}, updated ${changed.length}`);
}catch(e){
 console.error('FAILED',e.message);
 process.exitCode=1;
}
