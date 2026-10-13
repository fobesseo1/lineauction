// Parcel facts for current 상가·건물·토지 properties → public.parcel_info (one row per PNU).
//   node scripts/geo/parcel-info.mjs [--limit N]
// 개별공시지가 + 토지이용계획 from vworld, building summary from 건축HUB 표제부. A PNU is refreshed
// once a year (공시지가 changes yearly); raw answers are cached in data/geo/parcels-info.json.
import {mkdir,readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
process.loadEnvFile('.env.local');

const limitArg=process.argv.indexOf('--limit');const limit=limitArg>0?Number(process.argv[limitArg+1]):2500;
const root='data/geo';await mkdir(root,{recursive:true});
await mkdir(`${root}/parcel`,{recursive:true});
if(!await singleRun(`${root}/parcel`,'scripts/geo/parcel-info.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const year=Number(new Date(Date.now()+9*3600e3).toISOString().slice(0,4));
const cachePath=`${root}/parcels-info.json`;
let cache={};try{cache=JSON.parse(await readFile(cachePath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}

async function json(url,attempts=3){
 for(let a=0;;a++){
  await sleep(250);
  try{return JSON.parse(await (await fetch(url,{signal:AbortSignal.timeout(30000)})).text());}
  catch(e){if(a<attempts-1){await sleep(3000*(a+1));continue;}throw e;}
 }
}
const vworld=(path,params)=>{const u=new URL(`https://api.vworld.kr/ned/data/${path}`);for(const [k,v] of Object.entries({key:process.env.VWORLD_API_KEY,format:'json',numOfRows:'100',pageNo:'1',domain:'http://localhost',...params}))u.searchParams.set(k,v);return json(u);};

async function landPrice(pnu){
 for(const y of [year,year-1]){
  const f=[].concat((await vworld('getIndvdLandPriceAttr',{pnu,stdrYear:String(y)})).indvdLandPrices?.field??[]);
  const v=Number(f[0]?.pblntfPclnd);if(v>0)return {price:v,year:y};
 }
 return {price:null,year:null};
}
async function landUse(pnu){
 const f=[].concat((await vworld('getLandUseAttr',{pnu})).landUses?.field??[]).filter(x=>x.cnflcAtNm==='포함');
 // 용도지역 codes: UQA 도시지역(주거·상업·공업·녹지), UQB 관리, UQC 농림, UQD 자연환경보전.
 const isZone=x=>/^UQ[ABCD]/.test(x.prposAreaDstrcCode);
 const zone=f.find(isZone)?.prposAreaDstrcCodeNm??null;
 return {zone,overlays:[...new Set(f.filter(x=>!isZone(x)).map(x=>x.prposAreaDstrcCodeNm))]};
}
// Largest main building on the lot (by 연면적) summarises the parcel.
async function building(pnu){
 const u=new URL('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo');
 for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,sigunguCd:pnu.slice(0,5),bjdongCd:pnu.slice(5,10),platGbCd:pnu[10]==='2'?'1':'0',bun:pnu.slice(11,15),ji:pnu.slice(15,19),numOfRows:'50',pageNo:'1',_type:'json'}))u.searchParams.set(k,v);
 const body=await json(u);
 if(body.OpenAPI_ServiceResponse)throw Error(`API_${body.OpenAPI_ServiceResponse.cmmMsgHeader?.returnReasonCode}`);
 const items=[].concat(body.response?.body?.items?.item??[]).filter(i=>i.mainAtchGbCd==='0'||i.mainAtchGbCdNm==='주건축물');
 const b=items.sort((a,b)=>Number(b.totArea)-Number(a.totArea))[0];
 if(!b)return null;
 const n=v=>{const x=Number(v);return Number.isFinite(x)&&x>0?x:null;};
 return {building_name:b.bldNm?.trim()||null,main_use:b.mainPurpsCdNm||null,use_approved_year:n(String(b.useAprDay??'').slice(0,4)),
  floor_area_ratio:n(b.vlRat),coverage_ratio:n(b.bcRat),total_floor_area:n(b.totArea),plot_area:n(b.platArea),floors_above:n(b.grndFlrCnt),floors_below:Number(b.ugrndFlrCnt)||0,structure:b.strctCdNm?.trim()||null};
}

const pnus=new Set();
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('properties').select('pnu').eq('is_current',true).eq('section','commercial').not('pnu','is',null).order('id').range(from,from+999);
 if(error)throw Error(error.message);data.forEach(r=>pnus.add(r.pnu));if(data.length<1000)break;
}
let fetched=0,stopped=null;
for(const pnu of pnus){
 if(fetched>=limit)break;
 // Parcels cached before 주구조 was kept get only the building register again.
 if(cache[pnu]?.year>=year){
  if(!cache[pnu].building_name&&!cache[pnu].main_use||'structure' in cache[pnu])continue;
  try{const b=await building(pnu);cache[pnu]={...cache[pnu],structure:b?.structure??null};fetched++;if(fetched%100===0)await writeJson(cachePath,cache);}
  catch(e){stopped=e.message;break;}
  continue;
 }
 try{
  const [lp,lu]=[await landPrice(pnu),await landUse(pnu)];
  const b=await building(pnu);
  cache[pnu]={year,land_price_per_m2:lp.price,land_price_year:lp.year,...lu,...(b??{})};
  fetched++;if(fetched%100===0)await writeJson(cachePath,cache);
 }catch(e){stopped=e.message;break;}
}
await writeJson(cachePath,cache);
const runAt=new Date().toISOString();
const rows=[...pnus].filter(p=>cache[p]).map(p=>{const {year:_,...v}=cache[p];return {pnu:p,building_name:null,main_use:null,use_approved_year:null,floor_area_ratio:null,coverage_ratio:null,total_floor_area:null,plot_area:null,floors_above:null,floors_below:null,structure:null,...v,checked_at:runAt};});
for(let i=0;i<rows.length;i+=500){const {error}=await supa.from('parcel_info').upsert(rows.slice(i,i+500),{onConflict:'pnu'});if(error)throw Error(error.message);}
console.log(JSON.stringify({pnus:pnus.size,fetched,stored:rows.length,stopped}));
