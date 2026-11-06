// 버스 정류장 → public.bus_stops, public.complex_bus_stops.
//   node scripts/detail/bus.mjs [--phase all|routes|stops] [--refresh]
// Stops: TAGO's yearly file (국토교통부_전국 버스정류장 위치정보, data.go.kr 15067528) plus, for 시도 flagged
// seoulBusFile in regions.json, 서울 열린데이터광장 OA-15067 (TAGO lists only other cities' stops inside Seoul).
// Express: TAGO routes per city (needs 버스노선정보 15098529 on the key); only 광역·직행좌석 routes are walked,
// so this costs a few thousand calls. Without the service, is_express stays null and everything else still runs.
import {readFile,writeFile,stat,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {arg,flag,sleep,readJson,dir,complexes,replaceRows,upsert,REGIONS,SIDO_NAMES,eventLog} from './common.mjs';
import {parseCsv,tagoStops,mergeStops,gridIndex,nearby,isExpressRoute} from './core.mjs';

const root='data/detail/bus';await dir(root,'routes');await mkdir('data/detail/files',{recursive:true});
if(!await singleRun(root,'scripts/detail/bus.mjs')){console.log('ALREADY_RUNNING');process.exit(0);}
const event=eventLog(root),phase=arg('--phase','all'),refresh=flag('--refresh');
const UA={'user-agent':'Mozilla/5.0 lineestate-data-factory/1.0'};
const ageDays=async p=>{try{return (Date.now()-(await stat(p)).mtimeMs)/86400e3;}catch(e){if(e.code==='ENOENT')return Infinity;throw e;}};

async function tagoFile(){
 const path='data/detail/files/tago-stops.csv';
 if(refresh||await ageDays(path)>90){
  const id='15067528',page=`https://www.data.go.kr/data/${id}/fileData.do`;
  const html=await (await fetch(page,{headers:UA})).text();
  const pk=html.match(/id="publicDataDetailPk"[^>]*value="([^"]+)"/)?.[1];if(!pk)throw Error('TAGO_FILE_NO_PK');
  const j=await (await fetch(`https://www.data.go.kr/tcs/dss/selectFileDataDownload.do?publicDataPk=${id}&publicDataDetailPk=${encodeURIComponent(pk)}&fileDetailSn=1`,{headers:{...UA,referer:page}})).json();
  // The portal sometimes hangs up on plain fetch; curl with the page as referer gets the file.
  execFileSync('curl',['-sSfL','--max-time','300','-A',UA['user-agent'],'-e',page,`https://www.data.go.kr/cmm/cmm/fileDownload.do?atchFileId=${j.atchFileId}&fileDetailSn=${j.fileDetailSn}`,'-o',`${path}.tmp`]);
  const size=(await stat(`${path}.tmp`)).size;if(size<1e6)throw Error(`TAGO_FILE_TOO_SMALL:${size}`);
  await writeFile(path,await readFile(`${path}.tmp`));await rm(`${path}.tmp`);
 }
 return new TextDecoder('euc-kr').decode(await readFile(path));
}
const seoulRows=async()=>{
 const path='data/detail/files/seoul-stops.json';
 if(!refresh&&await ageDays(path)<=90)return readJson(path,[]);
 const page=await (await fetch('https://data.seoul.go.kr/dataList/OA-15067/S/1/datasetView.do',{headers:UA})).text();
 const latest=[...page.matchAll(/title="([^"]+\.xlsx)" onclick="javascript:downloadFile\('(\d+)'\)/g)].find(m=>/위치정보\(\d{8}\)/.test(m[1]));
 if(!latest)throw Error('SEOUL_FILE_NOT_FOUND');
 const r=await fetch('https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false',{method:'POST',headers:{...UA,'content-type':'application/x-www-form-urlencoded',referer:'https://data.seoul.go.kr/'},body:new URLSearchParams({infId:'OA-15067',seqNo:'',seq:latest[2],infSeq:'1'})});
 if(!r.ok)throw Error(`SEOUL_FILE_${r.status}`);
 const work=`${root}/seoul-xlsx`;await rm(work,{recursive:true,force:true});await mkdir(work,{recursive:true});
 await writeFile(`${work}/f.xlsx`,Buffer.from(await r.arrayBuffer()));
 execFileSync(process.env.SystemRoot?`${process.env.SystemRoot}\\System32\\tar.exe`:'tar',['-xf','f.xlsx'],{cwd:work});
 const ss=[...(await readFile(`${work}/xl/sharedStrings.xml`,'utf8')).matchAll(/<si>(.*?)<\/si>/gs)].map(m=>[...m[1].matchAll(/<t[^>]*>([^<]*)/g)].map(x=>x[1]).join(''));
 const sheet=await readFile(`${work}/xl/worksheets/sheet1.xml`,'utf8');
 const table=[...sheet.matchAll(/<row [^>]*>(.*?)<\/row>/gs)].map(m=>{
  const row={};for(const c of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)){const v=c[3]?.match(/<v>([^<]*)/)?.[1];row[c[1]]=v==null?'':/t="s"/.test(c[2])?ss[+v]:v;}return row;});
 const head=table[0],col=n=>Object.keys(head).find(k=>head[k]===n);
 // Column names changed over the years; older files say STTN_NO, STTN_NM, CRDNT_X, CRDNT_Y.
 const [id,no,name,x,y]=[['NODE_ID'],['ARS_ID','STTN_NO'],['정류소명','STTN_NM'],['X좌표','CRDNT_X'],['Y좌표','CRDNT_Y']].map(names=>names.map(col).find(Boolean));
 if(!id||!x||!y)throw Error(`SEOUL_FILE_COLUMNS:${JSON.stringify(head)}`);
 const out=table.slice(1).map(r=>({id:`seoul:${r[id]}`,name:r[name]||null,lat:Number(r[y]),lon:Number(r[x]),city:'서울특별시',sido:'서울특별시',ars_no:r[no]||null,source:'seoul'})).filter(s=>s.lat>33&&s.lat<39&&s.lon>124&&s.lon<132);
 if(out.length<5000)throw Error(`SEOUL_FILE_TOO_FEW:${out.length}`);
 await writeJson(path,out);await rm(work,{recursive:true,force:true});
 return out;
};

async function tago(path,params){
 const u=new URL(`https://apis.data.go.kr/1613000/${path}`);
 for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,_type:'json',numOfRows:'1000',...params}))u.searchParams.set(k,v);
 for(let attempt=0;;attempt++){
  await sleep(250);
  try{
   const body=JSON.parse(await (await fetch(u,{signal:AbortSignal.timeout(25000)})).text());
   const gw=body.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
   if(gw)throw Error(`API_${gw}`);
   return {items:[].concat(body.response?.body?.items?.item??[]),total:Number(body.response?.body?.totalCount??0)};
  }catch(e){if(/^API_(22|30)$/.test(e.message)||attempt>=3)throw e;await sleep(5000*(attempt+1));}
 }
}
async function allPages(path,params){const out=[];for(let page=1;;page++){const {items,total}=await tago(path,{...params,pageNo:String(page)});out.push(...items);if(!items.length||out.length>=total)return out;}}

// nodeid → express route numbers. Cached per city and route; returns null when the API isn't open yet.
let newRoutes=false;
async function expressByStop(cityCodes){
 const map=new Map();let routes=0;
 try{
  for(const city of cityCodes){
   const file=`${root}/routes/${city}.json`;
   let cached=await readJson(file,null);
   if(!cached||refresh){
    const list=(await allPages('BusRouteInfoInqireService/getRouteNoList',{cityCode:city})).filter(r=>isExpressRoute(r.routetp));
    const out=[];
    for(const r of list){const stops=await allPages('BusRouteInfoInqireService/getRouteAcctoThrghSttnList',{cityCode:city,routeId:r.routeid});out.push({routeno:String(r.routeno),routetp:r.routetp,nodes:[...new Set(stops.map(s=>s.nodeid))]});}
    cached={fetchedAt:new Date().toISOString(),routes:out};await writeJson(file,cached);
    newRoutes=true;
   }
   for(const r of cached.routes){routes++;for(const n of r.nodes){const l=map.get(n)??new Set();l.add(r.routeno);map.set(n,l);}}
  }
  console.log(`EXPRESS routes ${routes}, stops ${map.size}`);
  return map;
 }catch(e){
  await event({phase:'routes',error:e.message});
  console.log(`EXPRESS skipped: ${e.message}`);
  return /^API_(30|22)$/.test(e.message)?null:Promise.reject(e);
 }
}

// 서울 stops near complexes: which routes stop there (서울특별시_정류소정보조회, busRouteType 6 = 광역). The development
// account allows about 1,000 calls a day, so this fills in over days from its cache.
const SEOUL_DAILY=Number(arg('--seoul-daily','900'));
// Type 6 is 서울's own 광역. 경기(8)·인천(7) routes share one type, so theirs are told by number: M·G·P lines and
// four-digit 직행좌석 (M5107광주, 5001-1A용인, P9110(출근)화성; not 917안양, 이음2). The city suffix is dropped.
const expressNumber=r=>{
 const type=String(r.busRouteType),name=String(r.busRouteNm??'').replace(/\(.*?\)/g,'');
 if(type==='6')return name;
 if(type!=='7'&&type!=='8')return null;
 return name.match(/^(?:[MGP]\d{3,4}|\d{4})(?:-?[0-9A-Z]+)?/)?.[0]??null;
};
async function seoulExpress(stops){
 const path=`${root}/seoul-routes.json`,cache=await readJson(path,{}),budget=await readJson(`${root}/seoul-budget.json`,{});
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 let fetched=0,stopped=null;
 for(const s of stops){
  const ars=String(s.ars_no??'').padStart(5,'0');
  if(!/^\d{5}$/.test(ars)||ars==='00000'||cache[ars])continue;
  if((budget[day]??0)>=SEOUL_DAILY){stopped='DAILY_BUDGET';break;}
  const u=new URL('http://ws.bus.go.kr/api/rest/stationinfo/getRouteByStation');
  for(const [k,v] of Object.entries({serviceKey:process.env.MOLIT_API_KEY,arsId:ars,resultType:'json'}))u.searchParams.set(k,v);
  budget[day]=(budget[day]??0)+1;
  try{
   await sleep(300);
   const body=JSON.parse(await (await fetch(u,{signal:AbortSignal.timeout(25000)})).text());
   const code=String(body.msgHeader?.headerCd??'');
   // 4 = no result: a stop without routes is an answer too. Anything else (quota, key) stops the pass.
   if(code!=='0'&&code!=='4'){stopped=`SEOUL_${code||'INVALID'}`;break;}
   cache[ars]=[...new Set([].concat(body.msgBody?.itemList??[]).map(expressNumber).filter(Boolean))];
   fetched++;
   if(fetched%100===0){await writeJson(path,cache);await writeJson(`${root}/seoul-budget.json`,budget);}
  }catch(e){stopped=String(e.message).replaceAll(process.env.MOLIT_API_KEY,'***');break;}
 }
 await writeJson(path,cache);await writeJson(`${root}/seoul-budget.json`,budget);
 const flags=new Map(),checked=new Set();
 for(const s of stops){const list=cache[String(s.ars_no??'').padStart(5,'0')];if(list){checked.add(s.id);if(list.length)flags.set(s.id,new Set(list));}}
 console.log(`SEOUL routes: fetched ${fetched}, checked ${checked.size}/${stops.length}, express ${flags.size}${stopped?` (stopped: ${stopped})`:''}`);
 return {flags,checked,fetched};
}

try{
 const tagoAll=tagoStops(parseCsv(await tagoFile()),SIDO_NAMES);
 const seoul=REGIONS.some(r=>r.seoulBusFile)?await seoulRows():[];
 const {stops,aliases}=mergeStops(seoul,tagoAll);
 console.log(`STOPS tago ${tagoAll.length}, seoul ${seoul.length}, merged ${aliases.size}, total ${stops.length}`);
 if(stops.length<1000)throw Error(`TOO_FEW_STOPS:${stops.length}`);
 const cities=[...new Set(tagoAll.map(s=>s.city_code).filter(Boolean))];
 const express=phase==='stops'?null:await expressByStop(cities);
 const flags=new Map();
 if(express){
  for(const [node,set] of express){
   const id=aliases.get(node)??node;
   const l=flags.get(id)??new Set();for(const r of set)l.add(r);flags.set(id,l);
  }
 }
 const now=new Date().toISOString();
 const idx=gridIndex(stops);
 const list=await complexes('kapt_code,latitude,longitude');
 // 서울 stops within 500 m of a complex get their routes asked, nearest-used first.
 const nearUse=new Map();
 for(const c of list){if(c.latitude==null||c.longitude==null)continue;for(const {p} of nearby(idx,c.latitude,c.longitude,500).slice(0,10))if(p.source==='seoul')nearUse.set(p.id,(nearUse.get(p.id)??0)+1);}
 const seoulById=new Map(stops.filter(s=>s.source==='seoul').map(s=>[s.id,s]));
 const seoulAsk=[...nearUse].sort((a,b)=>b[1]-a[1]).map(([id])=>seoulById.get(id));
 const seoulAnswer=phase==='stops'?{flags:new Map(),checked:new Set()}:await seoulExpress(seoulAsk);
 for(const [id,set] of seoulAnswer.flags){const l=flags.get(id)??new Set();for(const r of set)l.add(r);flags.set(id,l);}
 // true: an express route stops here. false: its routes were checked and none is. null: not checked yet.
 const expressOf=s=>flags.has(s.id)?true:(s.source==='seoul'?seoulAnswer.checked.has(s.id):!!express)||null;
 const stateOf=s=>{const v=expressOf(s);return v===true&&!flags.has(s.id)?false:v;};
 // A daily top-up with nothing new leaves the tables alone.
 if(!refresh&&!newRoutes&&!seoulAnswer.fetched&&flag('--if-new')){console.log('NOTHING_NEW');process.exit(0);}
 const rows=stops.map(s=>({id:s.id,name:s.name,latitude:s.lat,longitude:s.lon,sido:s.sido,city:s.city,ars_no:s.ars_no,source:s.source,is_express:stateOf(s),express_routes:flags.has(s.id)?[...flags.get(s.id)].sort():null,updated_at:now}));
 const r1=await replaceRows('bus_stops',rows,['id']);
 // Each complex: the 10 nearest stops within 500 m, plus up to 3 express stops within 1 km.
 const stopById=new Map(stops.map(s=>[s.id,s]));
 const links=[];let withStop=0,withExpress=0;
 for(const c of list){
  if(c.latitude==null||c.longitude==null)continue;
  const near=nearby(idx,c.latitude,c.longitude,1000);
  const pick=new Map();
  for(const {p,d} of near.filter(x=>x.d<=500).slice(0,10))pick.set(p.id,d);
  for(const {p,d} of near.filter(x=>flags.has(x.p.id)).slice(0,3))pick.set(p.id,d);
  if(near.some(x=>x.d<=500))withStop++;
  if(near.some(x=>flags.has(x.p.id)))withExpress++;
  for(const [id,d] of pick)links.push({kapt_code:c.kapt_code,stop_id:id,distance_m:d,is_express:stateOf(stopById.get(id))});
 }
 const r2=await replaceRows('complex_bus_stops',links,['kapt_code','stop_id']);
 console.log(JSON.stringify({stops:r1,links:r2,complexes:list.length,withStop500m:withStop,withExpress1km:withExpress,seoulToAsk:seoulAsk.length,seoulChecked:seoulAnswer.checked.size,expressStops:flags.size}));
}catch(e){console.error('FAILED',e.message);process.exitCode=1;}
