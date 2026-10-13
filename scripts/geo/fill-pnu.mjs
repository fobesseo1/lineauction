// PNU and map point for current properties that have none, from vworld address search.
//   node scripts/geo/fill-pnu.mjs [--limit N] [--dry-run]
// Court: the road address ("… 통일로1546번길 43-8 402동 3층304호") is searched as a road address.
// Onbid: listings without an address carry the lot address in the title ("… 심곡동 385 외 3필지 …"),
// searched as a parcel. vworld returns the parcel's PNU as the item id. Answers are cached in
// data/geo/address-pnu.json (misses too, retried after 30 days).
import {mkdir,readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
process.loadEnvFile('.env.local');

// "… 남동대로777번길 25 16층1605호 (구월동,…)" → "… 남동대로777번길 25"
export function roadAddress(address){
 const m=String(address??'').match(/^(.*?\S(?:로|길)\s*\d+(?:-\d+)?)(?=[\s,(]|$)/);
 return m?m[1].trim():null;
}
// "경기도 부천시 원미구 심곡동 385 외 3필지 …" → "경기도 부천시 원미구 심곡동 385"
export function lotAddress(text){
 const m=String(text??'').match(/^(.*?\S(?:동|리|가|읍|면)\s+(?:산\s*)?\d+(?:-\d+)?)(?=[\s,(]|$)/);
 return m?m[1].trim():null;
}

if(import.meta.url===`file:///${process.argv[1].replace(/\\/g,'/')}`){
 const dry=process.argv.includes('--dry-run');
 const limitArg=process.argv.indexOf('--limit');const limit=limitArg>0?Number(process.argv[limitArg+1]):Infinity;
 const root='data/geo';await mkdir(`${root}/fill-pnu`,{recursive:true});
 if(!await singleRun(`${root}/fill-pnu`,'scripts/geo/fill-pnu.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
 const cachePath=`${root}/address-pnu.json`;
 let cache={};try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));

 async function search(query,category,sido){
  const u=new URL('https://api.vworld.kr/req/search');
  for(const [k,v] of Object.entries({service:'search',request:'search',version:'2.0',size:'5',type:'address',category,format:'json',key:process.env.VWORLD_API_KEY,query}))u.searchParams.set(k,v);
  for(let attempt=0;;attempt++){
   await sleep(150);
   try{
    const j=await (await fetch(u,{signal:AbortSignal.timeout(20000)})).json();
    if(j.response?.status==='ERROR')throw Error(j.response.error?.text??'vworld error');
    const items=j.response?.result?.items??[];
    // Only the searched kind of address is printed in full (from the 시도).
    const hit=items.find(i=>/^\d{19}$/.test(i.id)&&(i.address?.[category]??'').startsWith(sido));
    return hit?{pnu:hit.id,lat:Number(hit.point.y),lng:Number(hit.point.x)}:null;
   }catch(e){if(attempt<2){await sleep(3000*(attempt+1));continue;}throw e;}
  }
 }

 const rows=[];
 for(let from=0;;from+=1000){
  const {data,error}=await supa.from('properties').select('id,source,sido,address,title,latitude').eq('is_current',true).is('pnu',null).order('id').range(from,from+999);
  if(error)throw Error(error.message);rows.push(...data);if(data.length<1000)break;
 }
 const stale=new Date(Date.now()-30*86400e3).toISOString();
 const updates=[],stats={properties:rows.length,searched:0,found:0,noAddress:0};
 for(const p of rows){
  // Either kind can appear in either source (화성 court lots, Onbid road-address titles).
  const text=p.source==='court'?p.address:p.address??p.title;
  const tries=[[roadAddress(text),'road'],[lotAddress(text),'parcel']].filter(([q])=>q);
  if(!tries.length||!p.sido){stats.noAddress++;continue;}
  let hit=null;
  for(const [query,category] of tries){
   const key=`${category}:${query}`;
   if(!(key in cache)||(cache[key]===null&&cache[`${key}@`]<stale)){
    if(stats.searched>=limit)break;
    cache[key]=await search(query,category,p.sido);cache[`${key}@`]=new Date().toISOString();stats.searched++;
    if(stats.searched%100===0)await writeJson(cachePath,cache);
   }
   hit=cache[key];if(hit)break;
  }
  if(stats.searched>=limit&&!hit)break;
  if(!hit)continue;
  stats.found++;
  updates.push({id:p.id,pnu:hit.pnu,...(p.latitude==null?{latitude:hit.lat,longitude:hit.lng}:{})});
 }
 await writeJson(cachePath,cache);
 if(!dry)for(const u of updates){const {id,...set}=u;const {error}=await supa.from('properties').update(set).eq('id',id);if(error)throw Error(`${id}: ${error.message}`);}
 console.log(JSON.stringify({...stats,updated:dry?0:updates.length,dry}));
}
