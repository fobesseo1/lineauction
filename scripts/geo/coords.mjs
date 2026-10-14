// Parcel coordinates for buildings, complexes and auction properties, plus court PNUs.
//   node scripts/geo/coords.mjs [--plan] [--limit N]
// Each PNU's parcel (LP_PA_CBND_BUBUN) is fetched once and cached in data/geo/parcels/<prefix>.json;
// its bounding-box centre is the map point. Then market_places, complexes and properties get
// latitude/longitude (and court properties a PNU from their lot address).
import {mkdir,readFile,readdir,access} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {regionCode} from '../court/regions.mjs';
import {singleRun} from '../single-run.mjs';
import {jibunPnu,placeId} from '../molit/summary.mjs';
import {courtAddress,sameDong} from '../molit/match.mjs';
import {vworldFeatures,bboxCenter,boxOf} from './vworld.mjs';
process.loadEnvFile('.env.local');

const plan=process.argv.includes('--plan');
const limitArg=process.argv.indexOf('--limit');const limit=limitArg>0?Number(process.argv[limitArg+1]):Infinity;
const root='data/geo';await mkdir(`${root}/parcels`,{recursive:true});
if(!await singleRun(root,'scripts/geo/coords.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const dongs=JSON.parse(await readFile(`${root}/dongs.json`,'utf8')).table;
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// 법정동 code for a MOLIT/court dong name inside a 시군구 (rural names may be "리" alone).
function bjdOf(lawd,dong){
 const t=dongs[lawd];if(!t||!dong)return null;
 if(t[dong])return t[dong];
 const hits=Object.entries(t).filter(([umd])=>sameDong(umd,dong));
 return hits.length===1?hits[0][1]:null;
}
const lawdsOf=address=>{const t=String(address??'').split(/\s+/);for(const n of [3,2]){const c=regionCode(t.slice(0,n).join(' '));if(c)return String(c).split(',');}return [];};

async function fetchAll(table,columns,filter=q=>q){
 const out=[];
 for(let from=0;;from+=1000){const {data,error}=await filter(supa.from(table).select(columns)).order('id').range(from,from+999);if(error)throw Error(`${table}: ${error.message}`);out.push(...data);if(data.length<1000)break;}
 return out;
}

// 1. Targets and their PNUs.
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});
const places=[...wh.prepare("select distinct kind,lawd,umd,jibun from trades where kind in ('apt','offi','rh') and umd is not null and jibun is not null").iterate()]
 .map(r=>({id:placeId(r.kind,r.lawd,r.umd,r.jibun),pnu:jibunPnu(bjdOf(r.lawd,r.umd),r.jibun)}));
wh.close();
const complexes=(await fetchAll('complexes','id,kapt_code,pnu')).filter(c=>c.pnu);
const properties=await fetchAll('properties','id,source,address,dong,pnu',q=>q.in('sido',['서울특별시','경기도','인천광역시']));
const courtPnu=new Map();
for(const p of properties){
 if(p.source!=='court')continue;
 const a=courtAddress(p.address);if(!a.jibun)continue;
 for(const lawd of lawdsOf(p.address)){const pnu=jibunPnu(bjdOf(lawd,a.dong),a.jibun);if(pnu){courtPnu.set(p.id,pnu);break;}}
}
const propertyPnu=p=>p.source==='court'?courtPnu.get(p.id)??null:p.pnu;
const wanted=new Set([...places.map(p=>p.pnu),...complexes.map(c=>c.pnu),...properties.map(propertyPnu)].filter(Boolean));

// 2. Parcel cache, sharded by the 10-digit 법정동 code.
const shards=new Map();
const shardOf=async pnu=>{const k=pnu.slice(0,10);if(!shards.has(k)){let v={};try{v=JSON.parse(await readFile(`${root}/parcels/${k}.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}shards.set(k,v);}return shards.get(k);};
const missing=[];for(const pnu of wanted)if(!((pnu) in await shardOf(pnu)))missing.push(pnu);
console.log(`places ${places.length} (pnu ${places.filter(p=>p.pnu).length}), complexes ${complexes.length}, properties ${properties.length} (court pnu ${courtPnu.size}); parcels wanted ${wanted.size}, to fetch ${missing.length}`);
if(plan)process.exit(0);

let fetched=0,timeouts=0,stopped=null;const dirty=new Set();
for(const pnu of missing){
 if(fetched>=limit)break;
 if(await access(`${root}/STOP`).then(()=>true,()=>false)){stopped='STOP_PRESENT';break;}
 try{
  // A slow response is retried twice, then that parcel is skipped (not cached) for the next run.
  let features=null;
  for(let attempt=0;attempt<3&&!features;attempt++){
   try{({features}=await vworldFeatures('LP_PA_CBND_BUBUN',{attrFilter:`pnu:=:${pnu}`,geometry:'true'},{size:1}));}
   catch(e){if(e.name!=='TimeoutError'&&!/VWORLD_HTTP_5/.test(e.message))throw e;await sleep(5000*(attempt+1));}
  }
  if(!features){timeouts++;continue;}
  const f=features[0];
  const shard=await shardOf(pnu);shard[pnu]=f?bboxCenter(f.bbox??boxOf(f.geometry)):null;dirty.add(pnu.slice(0,10));
  fetched++;
 }catch(e){stopped=e.message;break;}
 if(fetched%500===0){for(const k of dirty)await writeJson(`${root}/parcels/${k}.json`,shards.get(k));dirty.clear();console.log(`parcels fetched ${fetched}`);}
 await sleep(150);
}
for(const k of dirty)await writeJson(`${root}/parcels/${k}.json`,shards.get(k));
// The data API returns no per-feature bbox, so the polygon's own extent is used.

// 3. Write coordinates for everything whose parcel is known.
const point=async pnu=>pnu?(await shardOf(pnu))[pnu]??null:null;
async function applyGeo(table,rows){
 for(let i=0;i<rows.length;i+=2000){const {error}=await supa.rpc('apply_geo',{p_table:table,p_rows:rows.slice(i,i+2000)});if(error)throw Error(`${table}: ${error.message}`);}
}
const placeRows=[];for(const p of places){const c=await point(p.pnu);if(c)placeRows.push({id:p.id,pnu:p.pnu,lat:c.lat,lng:c.lng});}
const complexRows=[];for(const c of complexes){const pt=await point(c.pnu);if(pt)complexRows.push({id:c.id,lat:pt.lat,lng:pt.lng});}
const propertyRows=[];for(const p of properties){const pnu=propertyPnu(p);const c=await point(pnu);if(c||(p.source==='court'&&pnu))propertyRows.push({id:p.id,...(p.source==='court'&&pnu?{pnu}:{}),...(c?{lat:c.lat,lng:c.lng}:{})});}
await applyGeo('market_places',placeRows);
await applyGeo('complexes',complexRows);
await applyGeo('properties',propertyRows);
console.log(`DONE fetched ${fetched}, skipped after timeouts ${timeouts}${stopped?` (stopped: ${stopped})`:''}; coordinates: places ${placeRows.length}, complexes ${complexRows.length}, properties ${propertyRows.length}`);
