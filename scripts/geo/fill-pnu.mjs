// PNU and map point for current properties that have none.
//   node scripts/geo/fill-pnu.mjs [--limit N] [--dry-run] [--recheck]
// 1) Find the parcel with vworld address search: court road addresses ("… 통일로1546번길 43-8 402동 …"),
//    lot addresses ("… 심곡동 385외 3필지 …", also in Onbid titles), and for 개발지구 블록·로트 lots
//    the building name. Search results (geocoder terms) must not be stored, so search is only used to
//    find the PNU;
// 2) the PNU and its point are then read from the parcel layer (LP_PA_CBND_BUBUN, data API, storable
//    with "출처: 국토교통부 브이월드"), and only that is written.
// --recheck re-reads the point of properties filled by earlier runs (cache hits) from the parcel layer.
import {mkdir,readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {vworldFeatures,bboxCenter,boxOf} from './vworld.mjs';
process.loadEnvFile('.env.local');

const NUM='(?:산\\s*)?\\d+(?:-\\d+)?';
// "… 남동대로777번길 25 16층1605호 (구월동,…)" → "… 남동대로777번길 25"
export function roadAddress(address){
 const m=String(address??'').match(/^(.*?\S(?:로|길)\s*\d+(?:-\d+)?)(?=[\s,(]|$)/);
 return m?m[1].trim():null;
}
// "경기도 부천시 원미구 심곡동 385 외 3필지 …" / "… 풍산동 243-32외 6필지" / "… 은행동607번지" → "… 심곡동 385"
export function lotAddress(text){
 const t=String(text??'');
 // Usually the text starts with the address; Onbid titles may carry it in brackets instead
 // ("고덕강일지구 근린생활시설용지7-2(서울특별시 강동구 강일동 산22-1 일원)").
 const from=t.search(/(서울특별시|경기도|인천광역시)\s/);
 const m=t.slice(Math.max(from,0)).match(new RegExp(`^(.*?\\S(?:동|리|가|읍|면))\\s*(${NUM})(?=번지|외|일원|[\\s,()]|$)`));
 return m?`${m[1].trim()} ${m[2].replace(/\s+/g,'')}`:null;
}
// "경기도 화성시 오산동 982-1" → "화성시" (the 시 or 군 right after the 시도).
export const cityOf=full=>String(full??'').split(/\s+/)[1]??'';
// The 시도 is dropped and only the last part kept, for addresses whose 시군구 was renamed
// (화성시 → 화성시 동탄구, 인천 중구 → 영종구): "경기도 화성시 오산동 982-1" → "오산동 982-1".
export function shortAddress(full){
 const parts=String(full??'').split(/\s+/);
 return parts.length>=3?parts.slice(-2).join(' '):null;
}
// Building name after a 블록·로트 lot: "… 소사3지구4블록 평택뉴비전엘크루 110동 3층302호" → "평택뉴비전엘크루"
export function blockBuilding(text){
 const m=String(text??'').match(/(?:블록|로트)\s*([^\s\d(][^\s(]*)/);
 const name=m?.[1]??null;
 return name&&!/^(제?\d|[A-Z]?\d+동|대지|외)/.test(name)?name:null;
}

if(import.meta.url===`file:///${(process.argv[1]??'').replace(/\\/g,'/')}`){
 const dry=process.argv.includes('--dry-run'),recheck=process.argv.includes('--recheck');
 const limitArg=process.argv.indexOf('--limit');const limit=limitArg>0?Number(process.argv[limitArg+1]):Infinity;
 const root='data/geo';await mkdir(`${root}/fill-pnu`,{recursive:true});
 if(!await singleRun(`${root}/fill-pnu`,'scripts/geo/fill-pnu.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
 // Cache: query → PNU (or null), never search coordinates.
 const cachePath=`${root}/address-pnu.json`;
 let cache={};try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 for(const [k,v] of Object.entries(cache))if(v&&typeof v==='object')cache[k]=v.pnu; // older runs kept points
 const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));

 async function search(query,type,category,accept){
  const u=new URL('https://api.vworld.kr/req/search');
  for(const [k,v] of Object.entries({service:'search',request:'search',version:'2.0',size:'10',type,...(category?{category}:{}),format:'json',key:process.env.VWORLD_API_KEY,query}))u.searchParams.set(k,v);
  for(let attempt=0;;attempt++){
   await sleep(150);
   try{
    const j=await (await fetch(u,{signal:AbortSignal.timeout(20000)})).json();
    if(j.response?.status==='ERROR')throw Error(j.response.error?.text??'vworld error');
    return (j.response?.result?.items??[]).find(accept)??null;
   }catch(e){if(attempt<2){await sleep(3000*(attempt+1));continue;}throw e;}
  }
 }
 const pnuOf=i=>/^\d{19}$/.test(i?.id??'')?i.id:null;
 // Address search: the searched kind of address is printed in full (from the 시도).
 const byAddress=async(query,category,sido,suffix=null)=>pnuOf(await search(query,'address',category,i=>{
  const a=i.address?.[category]??'';return pnuOf(i)&&a.startsWith(sido)&&(!suffix||a.endsWith(suffix));}));
 // A place found by name → its lot address → that lot's PNU.
 async function byPlace(name,sido,city){
  const place=await search(`${city} ${name}`,'place',null,i=>(i.address?.parcel??'').startsWith(sido)||(i.address?.road??'').startsWith(sido));
  const lot=place?.address?.parcel;
  return lot?byAddress(lot.startsWith(sido)?lot:`${sido} ${lot}`,'parcel',sido):null;
 }

 const rows=[];
 for(let from=0;;from+=1000){
  let q=supa.from('properties').select('id,source,sido,sigungu,address,title,pnu,latitude').eq('is_current',true).order('id').range(from,from+999);
  q=recheck?q.not('pnu','is',null):q.is('pnu',null);
  const {data,error}=await q;if(error)throw Error(error.message);rows.push(...data);if(data.length<1000)break;
 }
 const stats={properties:rows.length,searched:0,found:0,noAddress:0,noParcel:0};
 const stale=new Date(Date.now()-30*86400e3).toISOString();
 const found=[];
 for(const p of rows){
  const text=p.source==='court'?p.address:p.address??p.title;
  const road=roadAddress(text),lot=lotAddress(text),building=blockBuilding(text);
  // Each try: [cache key, lookup]. Renamed 시군구 are retried with the short address.
  const tries=[
   road&&[`road:${road}`,()=>byAddress(road,'road',p.sido)],
   lot&&[`parcel:${lot}`,()=>byAddress(lot,'parcel',p.sido)],
   road&&[`road~:${road}`,()=>byAddress(shortAddress(road),'road',p.sido,shortAddress(road))],
   lot&&[`parcel~:${lot}`,()=>byAddress(shortAddress(lot),'parcel',p.sido,shortAddress(lot))],
   // Common 동 names ("오산동") need the city or 시도 in the query to reach the top results.
   lot&&[`parcel~city:${lot}`,()=>byAddress(`${cityOf(lot)} ${shortAddress(lot)}`,'parcel',p.sido,shortAddress(lot))],
   lot&&[`parcel~sido:${lot}`,()=>byAddress(`${p.sido} ${shortAddress(lot)}`,'parcel',p.sido,shortAddress(lot))],
   road&&[`road~sido:${road}`,()=>byAddress(`${p.sido} ${shortAddress(road)}`,'road',p.sido,shortAddress(road))],
   building&&[`place:${p.sigungu} ${building}`,()=>byPlace(building,p.sido,p.sigungu??'')],
  ].filter(Boolean);
  if(recheck){const key=tries.map(([k])=>k).find(k=>cache[k]===p.pnu);if(key)found.push({p,pnu:p.pnu});continue;}
  if(!tries.length||!p.sido){stats.noAddress++;continue;}
  let pnu=null;
  for(const [key,lookup] of tries){
   // Misses are retried after 30 days: vworld is still catching up with the 2026 구 changes (화성·인천).
   const due=!(key in cache)||(cache[key]===null&&!(cache[`${key}@`]>stale));
   if(due){if(stats.searched>=limit)break;cache[key]=await lookup();cache[`${key}@`]=new Date().toISOString();stats.searched++;if(stats.searched%100===0)await writeJson(cachePath,cache);}
   pnu=cache[key];if(pnu)break;
  }
  if(pnu)found.push({p,pnu});
 }
 await writeJson(cachePath,cache);

 // Confirm each PNU on the parcel layer and take the point from there.
 const updates=[];
 for(const {p,pnu} of found){
  let features=[];
  for(let attempt=0;;attempt++){
   try{({features}=await vworldFeatures('LP_PA_CBND_BUBUN',{attrFilter:`pnu:=:${pnu}`,geometry:'true'},{size:1}));break;}
   catch(e){if(attempt<2){await sleep(3000*(attempt+1));continue;}throw e;}
  }
  await sleep(100);
  // A recheck without a parcel drops the point an earlier run took from search results.
  const f=features[0];if(!f){stats.noParcel++;if(recheck)updates.push({id:p.id,latitude:null,longitude:null});continue;}
  const c=bboxCenter(f.bbox??boxOf(f.geometry));
  stats.found++;
  updates.push({id:p.id,pnu:f.properties?.pnu??pnu,...(c?{latitude:c.lat,longitude:c.lng}:{})});
 }
 if(!dry)for(const u of updates){const {id,...set}=u;const {error}=await supa.from('properties').update(set).eq('id',id);if(error)throw Error(`${id}: ${error.message}`);}
 console.log(JSON.stringify({...stats,updated:dry?0:updates.length,recheck,dry}));
}
