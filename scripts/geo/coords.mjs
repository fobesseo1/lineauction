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
import {lotAddress,shortAddress} from './fill-pnu.mjs';
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
const allComplexes=await fetchAll('complexes','id,kapt_code,pnu,name,sido,sigungu,road_address,jibun_address');
const complexes=allComplexes.filter(c=>c.pnu);
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

let fetched=0,timeouts=0,stopped=null;const dirty=new Set();const runStartedAt=new Date().toISOString();
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
 // Progress for the status window and the watchdog (the parcel shards alone don't show activity).
 if(fetched%100===0)await writeJson(`${root}/coords-progress.json`,{fetched,target:Math.min(limit,missing.length),startedAt:runStartedAt,updatedAt:new Date().toISOString()});
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
// Complexes without a parcel point (K-APT's lot was re-plotted after redevelopment, or no lot at all):
// the same complex's trade place, else the parcel found by address search (only the PNU is kept, in
// the cache fill-pnu uses; the point still comes from the parcel layer).
const located=new Set(complexRows.map(r=>r.id));
const placePoint=new Map();
for(const p of await fetchAll('market_places','id,kapt_code,latitude,longitude',q=>q.not('kapt_code','is',null).not('latitude','is',null)))placePoint.set(p.kapt_code,{lat:p.latitude,lng:p.longitude});
const pnuCachePath=`${root}/address-pnu.json`;
let pnuCache={};try{pnuCache=JSON.parse(await readFile(pnuCachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
async function search(query,type,category){
 const u=new URL('https://api.vworld.kr/req/search');
 for(const [k,v] of Object.entries({service:'search',request:'search',version:'2.0',size:'10',type,...(category?{category}:{}),format:'json',key:process.env.VWORLD_API_KEY,query}))u.searchParams.set(k,v);
 for(let attempt=0;;attempt++){
  await sleep(150);
  try{
   const j=await (await fetch(u,{signal:AbortSignal.timeout(20000)})).json();
   if(j.response?.status==='ERROR')throw Error(j.response.error?.text??'vworld error');
   return j.response?.result?.items??[];
  }catch(e){if(attempt<2){await sleep(3000*(attempt+1));continue;}throw e;}
 }
}
const searchPnu=async(query,category,sido,suffix=null)=>(await search(query,'address',category)).find(i=>{const a=i.address?.[category]??'';return /^\d{19}$/.test(i.id??'')&&a.startsWith(sido)&&(!suffix||a.endsWith(suffix));})?.id??null;
// New complexes whose addresses vworld does not know yet are often a named place already: the
// complex itself ("마곡엠밸리9단지아파트", "…/916동"), never its bus stop or 경로당. Its lot → PNU.
const bare=s=>String(s??'').replace(/\s+/g,'').replace(/아파트$/,'');
async function placePnu(c){
 const hit=(await search(`${c.sigungu??''} ${c.name}`,'place')).find(i=>bare(String(i.title??'').replace(/\/\d+동$/,''))===bare(c.name)&&(i.address?.parcel??'').startsWith(c.sido)&&/\d+(-\d+)?$/.test(i.address.parcel)&&!/\s0$/.test(i.address.parcel));
 return hit?searchPnu(hit.address.parcel,'parcel',c.sido):null;
}
const stats={place:0,searched:0,search:0,missing:0};
for(const c of allComplexes){
 if(located.has(c.id))continue;
 const fromPlace=c.kapt_code&&placePoint.get(c.kapt_code);
 if(fromPlace){complexRows.push({id:c.id,...fromPlace});stats.place++;continue;}
 const road=c.road_address?.trim()||null,lot=lotAddress(c.jibun_address);
 const tries=[
  road&&[`road:${road}`,()=>searchPnu(road,'road',c.sido)],
  lot&&[`parcel:${lot}`,()=>searchPnu(lot,'parcel',c.sido)],
  // Renamed 시군구 (화성시 동탄구, 인천 검단구) are retried without them.
  road&&[`road~sido:${road}`,()=>searchPnu(`${c.sido} ${shortAddress(road)}`,'road',c.sido,shortAddress(road))],
  c.name&&[`complex-place:${c.sido} ${c.sigungu} ${c.name}`,()=>placePnu(c)],
 ].filter(Boolean);
 let pt=null;
 for(const [key,lookup] of tries){
  if(!(key in pnuCache)){if(plan||stats.searched>=limit)break;pnuCache[key]=await lookup();pnuCache[`${key}@`]=new Date().toISOString();stats.searched++;}
  const pnu=pnuCache[key];if(!pnu)continue;
  if(!(pnu in await shardOf(pnu))){
   const {features}=await vworldFeatures('LP_PA_CBND_BUBUN',{attrFilter:`pnu:=:${pnu}`,geometry:'true'},{size:1});
   const f=features[0];(await shardOf(pnu))[pnu]=f?bboxCenter(f.bbox??boxOf(f.geometry)):null;
   await writeJson(`${root}/parcels/${pnu.slice(0,10)}.json`,shards.get(pnu.slice(0,10)));await sleep(150);
  }
  pt=await point(pnu);if(pt)break;
 }
 if(pt){complexRows.push({id:c.id,lat:pt.lat,lng:pt.lng});stats.search++;}else stats.missing++;
}
await writeJson(pnuCachePath,pnuCache);
console.log(`complexes without a parcel point: from trade places ${stats.place}, from address search ${stats.search} (searched ${stats.searched}), still missing ${stats.missing}`);
const propertyRows=[];for(const p of properties){const pnu=propertyPnu(p);const c=await point(pnu);if(c||(p.source==='court'&&pnu))propertyRows.push({id:p.id,...(p.source==='court'&&pnu?{pnu}:{}),...(c?{lat:c.lat,lng:c.lng}:{})});}
await applyGeo('market_places',placeRows);
await applyGeo('complexes',complexRows);
await applyGeo('properties',propertyRows);
console.log(`DONE fetched ${fetched}, skipped after timeouts ${timeouts}${stopped?` (stopped: ${stopped})`:''}; coordinates: places ${placeRows.length}, complexes ${complexRows.length}, properties ${propertyRows.length}`);
