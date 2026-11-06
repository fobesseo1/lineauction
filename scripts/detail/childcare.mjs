// 어린이집 (no key) · 유치원 (KINDER_API_KEY) → public.childcare_facilities, public.complex_childcare.
//   node scripts/detail/childcare.mjs [--part daycare|kindergarten|all] [--refresh]
// Answers are cached for 25 days. Without KINDER_API_KEY the kindergarten part is skipped and its rows stay as they are.
import {writeJson} from '../onbid/atomic.mjs';
import {stat} from 'node:fs/promises';
import {singleRun} from '../single-run.mjs';
import {arg,flag,sleep,readJson,dir,complexes,leafSigungu,upsert,replaceRows,fetchAll,REGIONS} from './common.mjs';
import {childcareRow,parseChildcareSheet,monthsBefore,kinderRow,gridIndex,nearby} from './core.mjs';

const root='data/detail/childcare';await dir(root,'daycare','kindergarten');
if(!await singleRun(root,'scripts/detail/childcare.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const part=arg('--part','all'),refresh=flag('--refresh');
const fresh=async p=>{if(refresh)return false;try{return (Date.now()-(await stat(p)).mtimeMs)/86400e3<25;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
// 어린이집정보공개포털 '어린이집 기본정보' (매월 말일 기준, svcseq 84): one request per 시도 and no key. The OPEN API
// cpmsapi021 was tried first; it answers only 50 rows per 시군구 with no type or coordinates.
const SHEET='https://info.childcare.go.kr/info_html5/stat/sheet/StatCrInfoResult.jsp';
async function daycare(sido){
 const file=`${root}/daycare/sido-${sido.code}.json`;
 if(await fresh(file))return readJson(file,[]);
 for(const ym of monthsBefore(new Date(),3)){
  await sleep(1000);
  const r=await fetch(SHEET,{method:'POST',headers:{'user-agent':'Mozilla/5.0 lineestate-data-factory/1.0','referer':'https://info.childcare.go.kr/','content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({flag:'crInfo',flagType:'',S_SAVENAME:'',exlChk:'',std_condi:'Y',wkyear:ym.slice(0,4),wkmonth:ym.slice(4,6),sido:sido.code,sigun:'',limit:'50000'}),signal:AbortSignal.timeout(180000)});
  if(!r.ok)throw Error(`CHILDCARE_SHEET_${r.status}`);
  const html=await r.text(),total=Number(html.match(/총 건수\s*:\s*([\d,]+)/)?.[1]?.replace(/,/g,'')??0),rows=parseChildcareSheet(html);
  if(!total)continue;   // this month is not loaded yet
  if(rows.length!==total)throw Error(`CHILDCARE_SHEET_INCOMPLETE:${rows.length}/${total}`);
  await writeJson(file,rows);
  console.log(`DAYCARE ${sido.name} ${ym}: ${rows.length}`);
  return rows;
 }
 throw Error(`CHILDCARE_SHEET_EMPTY:${sido.code}`);
}
async function kinder(region){
 const file=`${root}/kindergarten/${region.code}.json`;
 if(await fresh(file))return readJson(file,[]);
 const out=[];
 for(let page=1;;page++){
  const u=new URL('https://e-childschoolinfo.moe.go.kr/api/notice/basicInfo2.do');
  for(const [k,v] of Object.entries({key:process.env.KINDER_API_KEY,sidoCode:region.code.slice(0,2),sggCode:region.code,pageCnt:'100',currentPage:String(page)}))u.searchParams.set(k,v);
  let body;
  for(let attempt=0;;attempt++){
   await sleep(500);
   try{
    body=JSON.parse(await (await fetch(u,{signal:AbortSignal.timeout(60000)})).text());
    if(body.status&&body.status!=='SUCCESS')throw Error(`KINDER_${body.status}_${body.message??''}`);
    break;
   }catch(e){if(/KINDER_DENIED/.test(e.message)||attempt>=2)throw e;await sleep(5000*(attempt+1));}
  }
  const list=[].concat(body.kinderInfo??[]);
  out.push(...list);
  if(list.length<100)break;
 }
 await writeJson(file,out);return out;
}
const OPEN=/정상|재개|운영/;   // 재개 = reopened; 휴지 (suspended) stays out
try{
 const regions=leafSigungu();
 const rows=[];const summary={};
 if(part==='all'||part==='daycare'){
  let n=0;for(const s of REGIONS){for(const item of await daycare(s)){const row=childcareRow(item,s.name);if(row&&(!row.status||OPEN.test(row.status))){rows.push(row);n++;}}}
  summary.daycare=n;
 }else summary.daycare='skipped';
 if((part==='all'||part==='kindergarten')&&process.env.KINDER_API_KEY){
  let n=0;for(const r of regions){for(const item of await kinder(r)){const row=kinderRow(item,r.sido.name,r.name.split(' ').slice(1).join(' '));if(row&&row.name){rows.push(row);n++;}}}
  summary.kindergarten=n;
 }else summary.kindergarten='skipped';
 if(rows.length){
  const unique=new Map(rows.map(r=>[r.id,{...r,updated_at:new Date().toISOString()}]));
  await upsert('childcare_facilities',[...unique.values()],'id');
  // Closed places fall out of the answers; drop them for the parts refreshed this run.
  const refreshed=[...new Set(rows.map(r=>r.kind))];
  const current=await fetchAll('childcare_facilities','id,kind',q=>q.in('kind',refreshed),'id');
  const gone=current.filter(r=>!unique.has(r.id)).map(r=>r.id);
  if(current.length>100&&gone.length/current.length>0.3)throw Error(`DELETE_GUARD:${gone.length}/${current.length}`);
  const {db}=await import('./common.mjs');
  for(let i=0;i<gone.length;i+=200){const {error}=await db.from('childcare_facilities').delete().in('id',gone.slice(i,i+200));if(error)throw Error(error.message);}
  summary.removed=gone.length;
 }
 const all=(await fetchAll('childcare_facilities','id,kind,type_code,latitude,longitude',q=>q.not('latitude','is',null),'id')).map(f=>({...f,lat:f.latitude,lon:f.longitude}));
 // Each complex: the 10 nearest of each kind within 1 km; if none, the nearest within 2 km.
 const idx=gridIndex(all);
 const list=await complexes('kapt_code,latitude,longitude');
 const links=[];let withDaycare=0,withKinder=0;
 for(const c of list){
  if(c.latitude==null||c.longitude==null)continue;
  const near=nearby(idx,c.latitude,c.longitude,2000);
  for(const kind of ['daycare','kindergarten']){
   const same=near.filter(x=>x.p.kind===kind),pick=same.filter(x=>x.d<=1000).slice(0,10);
   const chosen=pick.length?pick:same.slice(0,1);
   if(chosen.length){if(kind==='daycare')withDaycare++;else withKinder++;}
   for(const {p,d} of chosen)links.push({kapt_code:c.kapt_code,facility_id:p.id,kind,type_code:p.type_code,distance_m:d});
  }
 }
 const r=all.length?await replaceRows('complex_childcare',links,['kapt_code','facility_id']):{written:0,removed:0};
 console.log(JSON.stringify({...summary,facilities:all.length,links:r,complexes:list.length,withDaycare,withKinder}));
}catch(e){console.error('FAILED',e.message);process.exitCode=1;}
