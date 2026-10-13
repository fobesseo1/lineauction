// Map points for the 한국부동산원 상권 in the capital area → calc_constants 'commercial.areas', so the
// price calculator can pick the nearest 상권 (and its 권역) for a property instead of guessing by 시군구.
//   node scripts/calc/commercial-areas.mjs
// R-ONE gives only names ("서울>강남>테헤란로"); each leaf name is looked up with vworld place search
// inside its 시도, falling back to an address search. Cached in data/calc/areas.json.
import {mkdir,readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
process.loadEnvFile('.env.local');

const SIDO={서울:'서울특별시',경기:'경기도',인천:'인천광역시'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await mkdir('data/calc',{recursive:true});
const cachePath='data/calc/areas.json';
let cache={};try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

async function search(query,type,sido){
 const u=new URL('https://api.vworld.kr/req/search');
 for(const [k,v] of Object.entries({service:'search',request:'search',version:'2.0',size:'10',type,format:'json',key:process.env.VWORLD_API_KEY,query,...(type==='address'?{category:'road'}:{})}))u.searchParams.set(k,v);
 await sleep(200);
 const j=await (await fetch(u,{signal:AbortSignal.timeout(20000)})).json();
 const items=j.response?.result?.items??[];
 const addr=i=>i.address?.road||i.address?.parcel||'';
 const hit=items.find(i=>addr(i).startsWith(sido));
 return hit?{lat:Number(hit.point.y),lng:Number(hit.point.x),address:addr(hit),matched:hit.title}:null;
}

// Survey names that are not searchable places, with the place they are named after.
const ALIASES={'경기>광주시가지':'경안동','경기>김포운양역':'운양역','경기>김포한강구래':'구래역','경기>범계학원가':'범계역','경기>분당역세권':'서현역',
 '경기>선부다이아몬드':'선부동','경기>성남구시가지':'신흥역','경기>하남원도심':'신장동','인천>검단사거리완정역':'완정역','인천>인하대앞':'인하대학교'};

// Every capital-area 상권 that appears in any of the four survey tables.
const names=new Set();
for(const row of (await supa.from('calc_constants').select('value').like('key','commercial.%')).data??[])
 for(const k of Object.keys(row.value?.regions??{}))if(k.split('>').length>=3||(k.split('>').length===2&&k.startsWith('경기')||k.startsWith('인천>')))names.add(k);
let looked=0,missing=[];
for(const full of [...names].sort()){
 if(cache[full])continue; // misses are retried each run
 const parts=full.split('>'),sido=SIDO[parts[0]],leaf=parts.at(-1);
 const variants=[...new Set([...(ALIASES[full]?[ALIASES[full]]:[]),leaf,leaf.replace(/\//g,' '),leaf.split('/')[0],leaf.replace(/(사거리|오거리|네거리|로터리)$/,'')])];
 let hit=null;
 // With the 시도 prefix first, then the bare name (the prefix sometimes hides 경기 places).
 for(const q of [...variants.map(v=>`${parts[0]} ${v}`),...variants]){hit=await search(q,'place',sido);if(hit)break;}
 if(!hit)hit=await search(`${sido} ${leaf.split('/')[0]}`,'address',sido);
 cache[full]=hit;looked++;if(!hit)missing.push(full);
}
await writeJson(cachePath,cache);
const value={};
for(const full of names){const c=cache[full];if(c)value[full]={lat:Math.round(c.lat*1e5)/1e5,lng:Math.round(c.lng*1e5)/1e5,area:full.split('>').length>=3?full.split('>').slice(0,2).join('>'):null,matched:c.matched,address:c.address};}
const {error}=await supa.from('calc_constants').upsert({key:'commercial.areas',value,unit:'위경도',as_of:new Date().toISOString().slice(0,10),
 source:'선자산 계산 (한국부동산원 상권 이름을 국토교통부 브이월드 검색으로 위치 찾기)',source_url:null,
 note:'상권 대표 지점(공식 경계 아님). area는 서울 권역(서울>강남 등). 물건과 가장 가까운 상권(예: 2km 이내)을 쓰고, 없으면 권역·시도 값',updated_at:new Date().toISOString()},{onConflict:'key'});
if(error)throw Error(error.message);
console.log(JSON.stringify({areas:names.size,looked,located:Object.keys(value).length,missing}));
