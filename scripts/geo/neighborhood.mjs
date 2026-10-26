// 동네 환경 per complex → public.complexes: 공원 거리·면적, 대형마트·백화점 (OpenStreetMap) and 종합병원,
// 의원·학원 수 (소상공인시장진흥공단 상가(상권)정보, quarterly).
//   node scripts/geo/neighborhood.mjs [--refresh]
// Overpass and 상가정보 answers are cached in data/neighborhood/raw and refetched when older than 30 days;
// the per-complex pass is local and writes only changed complexes.
import {mkdir,readFile,stat} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {OVERPASS_URL} from './stations-core.mjs';
import {SCHOOL_TILES} from './schools-core.mjs';
import {parkQuery,martQuery,osmParks,osmMarts,gridIndex,neighborhoodFor,MAX_SEARCH,STORE_SIDO,STORE_GROUPS,storeRows,servicesFor,GENERAL_HOSPITAL,CLINIC,ACADEMY,ACADEMY_FAR} from './neighborhood-core.mjs';
process.loadEnvFile('.env.local');

const root='data/neighborhood';await mkdir(`${root}/raw`,{recursive:true});
if(!await singleRun(root,'scripts/geo/neighborhood.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const ageDays=async p=>{try{return (Date.now()-(await stat(p)).mtimeMs)/86400_000;}catch(e){if(e.code==='ENOENT')return Infinity;throw e;}};

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

// One 시도 × 업종 대분류, 1,000 a page (서울 교육 is ~44k stores).
async function stores(sido,group){
 const base='https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong';
 const out=[];let total=Infinity;
 for(let page=1;(page-1)*1000<total;page++){
  const url=`${base}?serviceKey=${encodeURIComponent(process.env.MOLIT_API_KEY)}&type=json&divId=ctprvnCd&key=${sido}&indsLclsCd=${group}&numOfRows=1000&pageNo=${page}`;
  for(let attempt=1;;attempt++){
   try{
    const r=await fetch(url,{signal:AbortSignal.timeout(60_000)});
    const j=JSON.parse(await r.text());
    if(j.header?.resultCode!=='00')throw Error(`STORE_${j.header?.resultCode}:${j.header?.resultMsg}`);
    total=j.body.totalCount;out.push(...storeRows(j.body.items??[]));break;
   }catch(e){if(attempt>=4)throw e;await sleep(10_000*attempt);}
  }
 }
 if(out.length<total*0.95)throw Error(`STORE_SHORT:${sido}/${group} ${out.length} of ${total}`);
 return out;
}

try{
 const refresh=process.argv.includes('--refresh');
 const sources={park:parkQuery,mart:martQuery};
 const elements={park:[],mart:[]};let refreshed=false;
 for(const [kind,query] of Object.entries(sources))for(const [i,tile] of SCHOOL_TILES.entries()){
  const path=`${root}/raw/${kind}${i+1}.json`;
  if(refresh||await ageDays(path)>30){await writeJson(path,await overpass(query(tile)));refreshed=true;await sleep(5000);}
  elements[kind].push(...JSON.parse(await readFile(path,'utf8')).elements);
 }
 const shops=[];
 for(const sido of STORE_SIDO)for(const group of STORE_GROUPS){
  const path=`${root}/raw/store-${sido}-${group}.json`;
  if(refresh||await ageDays(path)>30){await writeJson(path,await stores(sido,group));refreshed=true;}
  shops.push(...JSON.parse(await readFile(path,'utf8')));
 }
 // Some 요양병원 are filed under 종합병원; they are not where a family goes for care.
 const hospitals=shops.filter(s=>s.code===GENERAL_HOSPITAL&&!/요양/.test(s.name)),clinics=shops.filter(s=>CLINIC.test(s.code)),academies=shops.filter(s=>ACADEMY.has(s.code));
 const parks=osmParks(elements.park),marts=osmMarts(elements.mart);
 // A broken answer must never blank the columns: the capital area has ~10k parks and ~300 big stores.
 // 상가정보 has ~170 종합병원, ~36k 의원 and ~43k 교과·외국어 학원 in the capital area (2026-06).
 if(parks.length<5000||marts.length<150)throw Error(`TOO_FEW:${parks.length} parks, ${marts.length} marts`);
 if(hospitals.length<50||clinics.length<15000||academies.length<10000)throw Error(`TOO_FEW:${hospitals.length} hospitals, ${clinics.length} clinics, ${academies.length} academies`);
 const dot=s=>[s.lat,s.lon,s.lat,s.lon];
 const nearPark=gridIndex(parks,p=>p.bbox),nearMart=gridIndex(marts,dot),nearClinic=gridIndex(clinics,dot),nearAcademy=gridIndex(academies,dot);
 const cols=['park_nearest_m','park_nearest_name','park_nearest_area_m2','park_area_500m_m2','kids_park_count_500m','mart_nearest_m','mart_nearest_name','mart_count_1km',
  'general_hospital_m','general_hospital_name','clinic_count_1km','academy_count_500m','academy_count_1km'];
 const complexes=await fetchAll('complexes',`id,kapt_code,name,sido,latitude,longitude,${cols.join(',')}`);
 const now=new Date().toISOString();const changed=[];let filled=0;
 for(const c of complexes){
  // id is GENERATED ALWAYS, so rows are matched on kapt_code (every complex has one today).
  if(c.latitude==null||c.longitude==null||!c.kapt_code)continue;
  const point={lat:c.latitude,lon:c.longitude};
  const next={...neighborhoodFor(point,nearPark(point.lat,point.lon,MAX_SEARCH),nearMart(point.lat,point.lon,MAX_SEARCH)),
   ...servicesFor(point,hospitals,nearClinic(point.lat,point.lon,ACADEMY_FAR),nearAcademy(point.lat,point.lon,ACADEMY_FAR))};
  filled++;
  if(cols.every(k=>JSON.stringify(c[k])===JSON.stringify(next[k])))continue;
  changed.push({kapt_code:c.kapt_code,name:c.name,sido:c.sido,...next,neighborhood_computed_at:now});
 }
 await write('complexes',changed,'kapt_code');
 console.log(`PARKS ${parks.length}, MARTS ${marts.length}, HOSPITALS ${hospitals.length}, CLINICS ${clinics.length}, ACADEMIES ${academies.length}${refreshed?' (refreshed)':''}; complexes ${filled}, updated ${changed.length}`);
}catch(e){
 console.error('FAILED',e.message);
 process.exitCode=1;
}
