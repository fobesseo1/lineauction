// 동·타입: public.complex_buildings (표제부, 동별 층수) and public.complex_dong_types (전유부, 동 × 전용 타입 세대 수).
//   node scripts/detail/buildings.mjs --phase types   // from data/area-types/expos.tsv, no API call (about 10 min)
//   node scripts/detail/buildings.mjs --phase titles [--limit N] [--until HH:MM]   // BldRgstHubService, resumes from cache
// types also records each complex's extra lots (data/detail/buildings/lots.json), which titles then looks up.
import {createReadStream} from 'node:fs';
import {readFile,appendFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {EXTRACT_COLUMNS} from '../complex/area-core.mjs';
import {arg,sleep,exists,readJson,kstDay,dir,complexes,upsert,untilFromArg} from './common.mjs';
import {buildingRows,nameMatches} from './core.mjs';

const root='data/detail/buildings';await dir(root,'raw');
if(!await singleRun(root,'scripts/detail/buildings.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const phase=arg('--phase','titles'),limit=Number(arg('--limit','0'))||Infinity,until=untilFromArg();
const DAILY=7000;   // the daily jobs also use this service (build-year 600, parcel-info 500, court)
const list=await complexes();
const byPnu=new Map();
for(const c of list.filter(c=>c.pnu)){const l=byPnu.get(c.pnu)??[];l.push(c);byPnu.set(c.pnu,l);}

async function types(){
 const src='data/area-types/expos.tsv',meta=JSON.parse(await readFile(`${src}.meta.json`,'utf8'));
 const known=new Set(list.map(c=>c.kapt_code));
 const units=new Map(),lotOwn=new Set(),alts=new Map();
 const lines=createInterface({input:createReadStream(src),crlfDelay:Infinity});
 let header=true;
 for await(const line of lines){
  if(header){if(line!==EXTRACT_COLUMNS.join('\t'))throw Error('UNEXPECTED_HEADER');header=false;continue;}
  const f=line.split('\t');
  const [pnu,pk,dong,,,kind,code,,,area,alt]=f;
  let owner=null;
  if(!alt){lotOwn.add(pnu);const c=byPnu.get(pnu);if(c?.length===1)owner=`p:${c[0].kapt_code}`;}
  else if(!alt.includes(',')&&known.has(alt)){owner=`a:${alt}`;let s=alts.get(alt);if(!s)alts.set(alt,s=new Set());s.add(pnu);}
  if(!owner||kind!=='1')continue;
  const key=pk.length<=15?Number(pk):BigInt(pk);
  let u=units.get(key);
  if(!u)units.set(key,u={o:owner,d:dong.trim(),a:0,h:false});
  u.a+=Number(area);if(code.startsWith('02'))u.h=true;
 }
 const counts=new Map();
 for(const u of units.values()){
  if(!u.h||!(u.a>0))continue;
  const k=`${u.o}|${u.d}|${(Math.round(u.a*100)/100).toFixed(2)}`;
  counts.set(k,(counts.get(k)??0)+1);
 }
 units.clear();
 const hasOwn=new Set(),byOwner=new Map();
 for(const [k,n] of counts){const [o,d,a]=k.split('|');let l=byOwner.get(o);if(!l)byOwner.set(o,l=[]);l.push({d,a,n});if(o.startsWith('p:'))hasOwn.add(o.slice(2));}
 const rows=[];let own=0,matched=0,rejected=0;
 for(const c of list){
  let l=byOwner.get(`p:${c.kapt_code}`),alt=false;
  if(!l&&!(c.pnu&&lotOwn.has(c.pnu))){
   l=byOwner.get(`a:${c.kapt_code}`);alt=true;
   // Same rule as complex_area_types: a name match must account for roughly the complex's 세대수.
   const sum=l?.reduce((s,x)=>s+x.n,0)??0;
   if(l&&!(c.households>0&&sum>=c.households*0.5&&sum<=c.households*1.5)){rejected++;l=null;}
  }
  if(!l)continue;
  alt?matched++:own++;
  for(const x of l)rows.push({kapt_code:c.kapt_code,dong_name:x.d,exclusive_area:Number(x.a),households:x.n,source_month:meta.source_month});
 }
 await upsert('complex_dong_types',rows,'kapt_code,dong_name,exclusive_area',1000);
 const lots=Object.fromEntries([...alts].filter(([k])=>!hasOwn.has(k)).map(([k,s])=>[k,[...s]]));
 await writeJson(`${root}/lots.json`,lots);
 console.log(JSON.stringify({rows:rows.length,complexes:own+matched,own,matched,rejected,total:list.length}));
}

async function title(pnu){
 const items=[];
 for(let page=1;;page++){
  const u=new URL('https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo');
  for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,sigunguCd:pnu.slice(0,5),bjdongCd:pnu.slice(5,10),platGbCd:pnu[10]==='2'?'1':'0',bun:pnu.slice(11,15),ji:pnu.slice(15,19),numOfRows:'100',pageNo:String(page),_type:'json'}))u.searchParams.set(k,v);
  let body;
  for(let attempt=0;;attempt++){
   await sleep(500);calls++;
   try{
    body=JSON.parse(await (await fetch(u,{signal:AbortSignal.timeout(25000)})).text());
    const gw=body.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
    if(gw)throw Error(`API_${gw}`);
    break;
   }catch(e){
    if(/^API_(22|30)$/.test(e.message))throw e;
    if(attempt>=3)throw e;
    await sleep(5000*(attempt+1));
   }
  }
  items.push(...[].concat(body.response?.body?.items?.item??[]));
  if(page*100>=Number(body.response?.body?.totalCount??0))return items;
 }
}
let calls=0;
async function titles(){
 const budgetPath=`${root}/budget.json`,budget=await readJson(budgetPath,{});
 const lots=await readJson(`${root}/lots.json`,{});
 const jobs=[];
 for(const c of list){const set=new Set([...(c.pnu?[c.pnu]:[]),...(lots[c.kapt_code]??[])]);for(const pnu of set)jobs.push({c,pnu});}
 let fetched=0,stopped=null,errors=0;const touched=new Set();
 // Writes the whole cache again without any API call.
 if(process.argv.includes('--rewrite')){
  const all=new Set();for(const {pnu} of jobs)if(await exists(`${root}/raw/${pnu}.json`))all.add(pnu);
  await writeRows(jobs,all);console.log(JSON.stringify({rewritten:all.size}));return;
 }
 for(const {pnu} of jobs){
  if(fetched>=limit)break;
  const file=`${root}/raw/${pnu}.json`;
  if(await exists(file))continue;
  if(Date.now()>=until){stopped='UNTIL';break;}
  if(await exists(`${root}/STOP`)){stopped='STOP_PRESENT';break;}
  if((budget[kstDay()]??0)>=DAILY){stopped='DAILY_BUDGET';break;}
  try{
   const items=await title(pnu);
   await writeJson(file,{fetchedAt:new Date().toISOString(),items:items.filter(i=>String(i.mainAtchGbCd??'0').trim()==='0').map(i=>({mgmBldrgstPk:String(i.mgmBldrgstPk),dongNm:i.dongNm,bldNm:i.bldNm,mainPurpsCd:i.mainPurpsCd,mainPurpsCdNm:i.mainPurpsCdNm,etcPurps:i.etcPurps,mainAtchGbCd:i.mainAtchGbCd,grndFlrCnt:i.grndFlrCnt,ugrndFlrCnt:i.ugrndFlrCnt,hhldCnt:i.hhldCnt,hoCnt:i.hoCnt,heit:i.heit,rideUseElvtCnt:i.rideUseElvtCnt,emgenUseElvtCnt:i.emgenUseElvtCnt,strctCdNm:i.strctCdNm,useAprDay:i.useAprDay}))});
   fetched++;errors=0;touched.add(pnu);budget[kstDay()]=(budget[kstDay()]??0)+1;
   if(fetched%100===0){await writeJson(budgetPath,budget);console.log(`titles ${fetched}`);}
   if(touched.size>=500){await writeRows(jobs,touched);touched.clear();}
  }catch(e){
   if(/^API_(22|30)$/.test(e.message)){stopped=e.message;break;}
   await appendFile(`${root}/errors.log`,`${pnu} ${e.message}\n`);
   if(++errors>=10){stopped=`CONSECUTIVE:${e.message}`;break;}
  }
 }
 await writeJson(budgetPath,budget);
 await writeRows(jobs,touched);
 console.log(JSON.stringify({fetched,calls,stopped,remaining:await pendingCount(jobs)}));
}
async function pendingCount(jobs){let n=0;for(const {pnu} of jobs)if(!await exists(`${root}/raw/${pnu}.json`))n++;return n;}
async function writeRows(jobs,touched){
 if(!touched.size)return;
 const out=new Map();
 for(const {c,pnu} of jobs){
  if(!touched.has(pnu))continue;
  const cached=await readJson(`${root}/raw/${pnu}.json`,null);if(!cached)continue;
  const shared=(byPnu.get(pnu)?.length??0)>1;
  const items=shared?cached.items.filter(i=>nameMatches(c.name,i.bldNm)):cached.items;
  for(const r of buildingRows(c.kapt_code,pnu,items))out.set(`${r.kapt_code}|${r.register_pk}`,{...r,updated_at:new Date().toISOString()});
 }
 await upsert('complex_buildings',[...out.values()],'kapt_code,register_pk');
}

try{
 if(phase==='types')await types();
 else if(phase==='titles')await titles();
 else throw Error('INVALID_PHASE');
}catch(e){console.error('FAILED',e.message);process.exitCode=1;}
