// 학교알리미 → public.schools (위치 + 학급당 학생수), public.complex_schools (단지에서 가까운 초·중·고).
//   node scripts/detail/schools.mjs [--year 2026]
// Needs SCHOOLINFO_API_KEY.
// Filings stay open through the year; a year with no answers falls back to the year before.
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {arg,sleep,readJson,dir,complexes,replaceRows,leafSigungu} from './common.mjs';
import {schoolRow,SCHOOL_KINDS,gridIndex,nearby,metres,schoolStem,sameSchoolStem} from './core.mjs';

const root='data/detail/schools';await dir(root,'raw');
if(!await singleRun(root,'scripts/detail/schools.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const key=process.env.SCHOOLINFO_API_KEY;
if(!key){console.log('SKIPPED: SCHOOLINFO_API_KEY is not set');process.exit(0);}
const thisYear=new Date(Date.now()+9*3600e3).getUTCFullYear();

// Keys issued from 2026 must name a 시도 and 시군구, so this is one call per 시군구 × 학교급 × 항목 (about 500 a year).
async function api(apiType,kind,year,region){
 const file=`${root}/raw/${year}-${apiType}-${kind}-${region}.json`;
 const cached=await readJson(file,null);if(cached)return cached;
 const u=new URL('https://www.schoolinfo.go.kr/openApi.do');
 for(const [k,v] of Object.entries({apiKey:key,apiType,pbanYr:String(year),schulKndCode:kind,sidoCode:region.slice(0,2),sggCode:region}))u.searchParams.set(k,v);
 for(let attempt=0;;attempt++){
  await sleep(300);
  try{
   const body=JSON.parse(await (await fetch(u,{signal:AbortSignal.timeout(60000)})).text());
   // A 시군구 may simply have no school of this kind.
   if(body.resultCode!=='success'&&!/존재하지 않습니다/.test(body.resultMsg??''))throw Error(`SCHOOLINFO_${body.resultMsg}`);
   const list=body.list??[];
   if(body.resultCode==='success'||year<thisYear)await writeJson(file,list);
   return list;
  }catch(e){if(attempt>=2)throw Error(String(e.message).replaceAll(key,'***'));await sleep(5000*(attempt+1));}
 }
}
try{
 const years=arg('--year',null)?[Number(arg('--year',null))]:[thisYear,thisYear-1];
 const onlyRegions=arg('--regions',null)?.split(',');
 const regions=leafSigungu().filter(r=>!onlyRegions||onlyRegions.includes(r.code));
 const rows=new Map(),usedYears={};
 for(const {code:region} of regions){
  for(const kind of Object.keys(SCHOOL_KINDS)){
   let stats=[],year=null;
   for(const y of years){stats=await api('09',kind,y,region);if(stats.length){year=y;break;}}
   if(!year)continue;
   usedYears[year]=(usedYears[year]??0)+1;
   const byCode=new Map(stats.map(s=>[String(s.SCHUL_CODE),s]));
   for(const b of await api('0',kind,year,region)){
    if(String(b.ABSCH_YN??'').toUpperCase()==='Y')continue;
    const r=schoolRow({...b,SCHUL_KND_SC_CODE:kind},byCode.get(String(b.SCHUL_CODE)),year);
    if(r&&r.name)rows.set(r.school_code,{...r,updated_at:new Date().toISOString()});
   }
  }
 }
 if(onlyRegions){console.log(JSON.stringify({regions:regions.length,schools:rows.size,sample:[...rows.values()].slice(0,3)}));process.exit(0);}
 if(rows.size<500)throw Error(`TOO_FEW_SCHOOLS:${rows.size}`);
 const all=[...rows.values()];
 const r1=await replaceRows('schools',all,['school_code']);
 const located=all.filter(r=>r.latitude!=null).map(r=>({...r,lat:r.latitude,lon:r.longitude}));
 // Each complex: its 3 nearest of each 학교급 within 3 km, plus its 배정 초등학교 wherever it is.
 const idx=gridIndex(located);
 const byName=new Map();for(const s of located.filter(s=>s.kind==='elementary')){const l=byName.get(s.name)??[];l.push(s);byName.set(s.name,l);}
 const list=await complexes('kapt_code,latitude,longitude,elementary_school');
 const links=[],linked={elementary:0,middle:0,high:0};let assigned=0,withAssigned=0;
 for(const c of list){
  if(c.latitude==null||c.longitude==null)continue;
  const near=nearby(idx,c.latitude,c.longitude,3000);
  const pick=new Map();
  for(const kind of Object.values(SCHOOL_KINDS)){const some=near.filter(x=>x.p.kind===kind).slice(0,3);if(some.length)linked[kind]++;for(const {p,d} of some)pick.set(p.school_code,{p,d});}
  let assignedCode=null;
  if(c.elementary_school){
   withAssigned++;
   let same=(byName.get(c.elementary_school)??[]).map(p=>({p,d:metres(c.latitude,c.longitude,p.lat,p.lon)})).sort((a,b)=>a.d-b.d)[0];
   // 학구도 and 학교알리미 name the same school differently (용현초등학교 / 인천용현초등학교): nearest with the same stem.
   if(!same||same.d>10000){const k=schoolStem(c.elementary_school);same=k.length>=2?nearby(idx,c.latitude,c.longitude,5000).find(x=>x.p.kind==='elementary'&&sameSchoolStem(k,schoolStem(x.p.name))):null;}
   if(same&&same.d<=10000){assignedCode=same.p.school_code;pick.set(assignedCode,same);assigned++;}
  }
  for(const [code,{p,d}] of pick)links.push({kapt_code:c.kapt_code,school_code:code,kind:p.kind,distance_m:d,is_assigned:code===assignedCode});
 }
 const r2=await replaceRows('complex_schools',links,['kapt_code','school_code']);
 console.log(JSON.stringify({usedYears,schools:r1,located:located.length,withClassSize:all.filter(r=>r.students_per_class!=null).length,links:r2,complexes:list.length,linked,withAssigned,assignedMatched:assigned}));
}catch(e){console.error('FAILED',e.message);process.exitCode=1;}
