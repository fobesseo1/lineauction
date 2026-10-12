// 공동주택 공시가격 from vworld (getApartHousingPriceAttr; 출처: 국토교통부 브이월드).
//   node scripts/geo/official-price.mjs [--part properties|complexes|all] [--limit N]
// properties: the auctioned unit's price by PNU + 동 + 호 → property_official_prices
// complexes : every unit of a complex's main lot, median per 평형 type → complex_official_prices
// Complex aggregates are cached per kapt code in data/geo/official/ so reruns resume.
import {mkdir,readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {median} from '../molit/summary.mjs';
import {unitOf} from './unit.mjs';
process.loadEnvFile('.env.local');

const arg=(n,f)=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:f;};
const part=arg('--part','all'),limit=Number(arg('--limit','6000'));
const root='data/geo/official';await mkdir(root,{recursive:true});
if(!await singleRun(root,'scripts/geo/official-price.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const year=Number(new Date(Date.now()+9*3600e3).toISOString().slice(0,4));
const runAt=new Date().toISOString();
let calls=0;

async function prices(params){
 if(calls>=limit)throw Error('DAILY_LIMIT');
 const url=new URL('https://api.vworld.kr/ned/data/getApartHousingPriceAttr');
 for(const [k,v] of Object.entries({key:process.env.VWORLD_API_KEY,format:'json',numOfRows:'1000',pageNo:'1',domain:'http://localhost',...params}))url.searchParams.set(k,v);
 for(let attempt=0;;attempt++){
  calls++;await sleep(150);
  try{
   const body=JSON.parse(await (await fetch(url,{signal:AbortSignal.timeout(30000)})).text()).apartHousingPrices;
   if(!body)return {rows:[],total:0};
   return {rows:[].concat(body.field??[]),total:Number(body.totalCount??0)};
  }catch(e){if(attempt<2){await sleep(3000*(attempt+1));continue;}throw e;}
 }
}
// This year's prices, else last year's (published around late April).
async function latest(params){
 for(const y of [year,year-1]){const r=await prices({...params,stdrYear:String(y)});if(r.total)return {...r,year:y};}
 return {rows:[],total:0,year:null};
}
const COMMUNAL=/^(아파트|도시형생활주택|주상복합|다세대|다세대주택|연립주택|연립주택,다세대,빌라|빌라)$/;

async function propertiesPart(){
 const props=[];
 for(let from=0;;from+=1000){
  const {data,error}=await supa.from('properties').select('id,source,usage_type,address,pnu').eq('is_current',true).eq('section','apartment').not('pnu','is',null).order('id').range(from,from+999);
  if(error)throw Error(error.message);props.push(...data);if(data.length<1000)break;
 }
 const done=new Set();
 for(let from=0;;from+=1000){const {data,error}=await supa.from('property_official_prices').select('property_id').eq('year',year).range(from,from+999);if(error)throw Error(error.message);data.forEach(r=>done.add(r.property_id));if(data.length<1000)break;}
 // Onbid rows carry the unit only in the kept display fields of the observation.
 const onbidAddr=new Map();
 const onbidIds=props.filter(p=>p.source==='onbid').map(p=>p.id);
 for(let i=0;i<onbidIds.length;i+=300){const {data,error}=await supa.from('onbid_observations').select('property_id,list_payload,detail_payload').in('property_id',onbidIds.slice(i,i+300));if(error)throw Error(error.message);for(const o of data){const d={...o.list_payload,...o.detail_payload};onbidAddr.set(o.property_id,d.zadrNm||d.cltrRadr||null);}}
 const rows=[];let looked=0,missing=0;
 for(const p of props){
  if(!COMMUNAL.test(p.usage_type)||done.has(p.id))continue;
  const {dong,ho}=unitOf(p.source==='onbid'?onbidAddr.get(p.id):p.address);
  if(!ho)continue;
  let r;try{r=await latest({pnu:p.pnu,hoNm:ho,...(dong?{dongNm:dong}:{})});}catch(e){if(e.message==='DAILY_LIMIT')break;throw e;}
  looked++;
  // Without a 동 the 호 must be unique on the lot.
  const hits=r.rows.filter(x=>String(x.hoNm)===ho&&(!dong||String(x.dongNm)===dong));
  const units=new Set(hits.map(x=>`${x.dongNm}|${x.hoNm}`));
  if(!hits.length||units.size>1){missing++;continue;}
  const h=hits[0];
  rows.push({property_id:p.id,price:Number(h.pblntfPc),year:r.year,dong_name:h.dongNm||null,ho_name:h.hoNm,area:Number(h.prvuseAr)||null,checked_at:runAt});
 }
 for(let i=0;i<rows.length;i+=500){const {error}=await supa.from('property_official_prices').upsert(rows.slice(i,i+500),{onConflict:'property_id'});if(error)throw Error(error.message);}
 return {looked,found:rows.length,missing};
}

async function complexesPart(){
 const cachePath=`${root}/complexes.json`;
 let cache={};try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 const complexes=[];
 for(let from=0;;from+=1000){const {data,error}=await supa.from('complexes').select('kapt_code,pnu').not('pnu','is',null).order('id').range(from,from+999);if(error)throw Error(error.message);complexes.push(...data);if(data.length<1000)break;}
 let fetched=0,stopped=null;
 for(const c of complexes){
  if(cache[c.kapt_code]?.year>=year)continue;
  try{
   const first=await latest({pnu:c.pnu});
   const all=[...first.rows];
   for(let page=2;page<=Math.ceil(first.total/1000);page++)all.push(...(await prices({pnu:c.pnu,stdrYear:String(first.year),pageNo:String(page)})).rows);
   const byType=new Map();
   for(const u of all){const area=Number(u.prvuseAr),price=Number(u.pblntfPc);if(!(area>0&&price>0))continue;const t=Math.floor(area);byType.set(t,[...(byType.get(t)??[]),price]);}
   cache[c.kapt_code]={year:first.year??year,types:[...byType].map(([t,ps])=>({area_type:t,median_price:median(ps),min_price:Math.min(...ps),max_price:Math.max(...ps),units:ps.length}))};
   fetched++;if(fetched%100===0)await writeJson(cachePath,cache);
  }catch(e){stopped=e.message;break;}
 }
 await writeJson(cachePath,cache);
 const rows=Object.entries(cache).filter(([,v])=>v.types?.length&&v.year).flatMap(([kapt,v])=>v.types.map(t=>({kapt_code:kapt,year:v.year,...t,checked_at:runAt})));
 for(let i=0;i<rows.length;i+=500){const {error}=await supa.from('complex_official_prices').upsert(rows.slice(i,i+500),{onConflict:'kapt_code,area_type'});if(error)throw Error(error.message);}
 return {fetched,remaining:complexes.filter(c=>!(cache[c.kapt_code]?.year>=year)).length,rows:rows.length,stopped};
}

const out={};
if(part==='properties'||part==='all')out.properties=await propertiesPart();
if(part==='complexes'||part==='all')out.complexes=await complexesPart();
console.log(JSON.stringify({...out,calls}));
