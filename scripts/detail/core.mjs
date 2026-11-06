// Pure helpers for the complex-detail collectors (관리비, 학교, 보육, 동·타입, 버스, 전월세 만기).
import {createHash} from 'node:crypto';
const clean=v=>v==null||String(v).trim()===''?null:String(v).trim();
const num=v=>{const s=clean(v);if(s==null)return null;const n=Number(s.replace(/,/g,''));return Number.isFinite(n)?n:null;};
const whole=v=>{const n=num(v);return n==null?null:Math.round(n);};

// ---- 전월세 계약 기간. MOLIT's contractTerm is "26.10~28.10" (yy.mm~yy.mm).
export function contractTerm(v){
 const m=clean(v)?.match(/^(\d{2})\.(\d{2})~(\d{2})\.(\d{2})$/);
 if(!m)return null;
 const [sm,em]=[Number(m[2]),Number(m[4])];
 if(sm<1||sm>12||em<1||em>12)return null;
 const start=`20${m[1]}-${m[2]}`,end=`20${m[3]}-${m[4]}`;
 // Filings like "26.03~99.12" are typos: 민간 임대 terms top out at 10 years.
 return end>=start&&Number(m[3])-Number(m[1])<=10?{start,end}:null;
}
const median=list=>{if(!list.length)return null;const s=[...list].sort((a,b)=>a-b);const i=s.length>>1;return s.length%2?s[i]:Math.round((s[i-1]+s[i])/2);};
// Contracts → one row per place × 타입 × 만기 월, keeping months from `fromMonth` on.
export function expiryRows(contracts,fromMonth){
 const groups=new Map();
 for(const c of contracts){
  if(c.end<fromMonth)continue;
  const key=`${c.place_id}|${c.area_type}|${c.end}`;
  let g=groups.get(key);
  if(!g)groups.set(key,g={place_id:c.place_id,kapt_code:c.kapt_code??null,area_type:c.area_type,end_month:c.end,contracts:0,jeonse:0,monthly:0,renewed:0,deposits:[],last_deal_date:null});
  g.contracts++;
  if(c.monthly_rent>0)g.monthly++;else{g.jeonse++;if(c.deposit>0)g.deposits.push(c.deposit);}
  if(c.contract_type==='갱신')g.renewed++;
  if(!g.last_deal_date||c.deal_date>g.last_deal_date)g.last_deal_date=c.deal_date;
 }
 return [...groups.values()].map(({deposits,...g})=>({...g,jeonse_median_deposit:median(deposits)}));
}

// ---- 관리비. Each operation answers one item; `field` → our column. Amounts are 원 for the whole complex.
const SERVICES={
 common:'AptCmnuseManageCostServiceV3',
 individual:'AptIndvdlzManageCostServiceV3',
 reserve:'AptRepairsCostServiceV3',
};
const labor=['pay','sundryCost','bonus','pension','accidentPremium','employPremium','nationalPension','healthPremium','welfareBenefit'];
export const FEE_OPS=[
 // 인건비 comes first: a complex with nothing filed for the month answers empty here, and the rest is skipped.
 {service:'common',op:'getHsmpLaborCostInfoV3',columns:{labor}},
 {service:'common',op:'getHsmpOfcrkCostInfoV3',columns:{office:['transportCost','officeSupply','bookSupply']}},
 {service:'common',op:'getHsmpTaxdueInfoV3',columns:{tax:['electCost','telCost','postageCost','taxrestCost']}},
 {service:'common',op:'getHsmpClothingCostInfoV3',columns:{clothing:['clothesCost']}},
 {service:'common',op:'getHsmpEduTraingCostInfoV3',columns:{training:['eduCost']}},
 {service:'common',op:'getHsmpVhcleMntncCostInfoV3',columns:{vehicle:['fuelCost','refairCost','carInsurance','carEtc']}},
 {service:'common',op:'getHsmpEtcCostInfoV3',columns:{other_overhead:['careItemCost','accountingCost','hiddenCost']}},
 {service:'common',op:'getHsmpCleaningCostInfoV3',columns:{cleaning:['cleanCost']}},
 {service:'common',op:'getHsmpGuardCostInfoV3',columns:{guard:['guardCost']}},
 {service:'common',op:'getHsmpDisinfectionCostInfoV3',columns:{disinfection:['disinfCost']}},
 {service:'common',op:'getHsmpElevatorMntncCostInfoV3',columns:{elevator:['elevCost']}},
 {service:'common',op:'getHsmpHomeNetworkMntncCostInfoV3',columns:{home_network:['hnetwCost']}},
 {service:'common',op:'getHsmpRepairsCostInfoV3',columns:{repairs:['lrefCost1']}},
 {service:'common',op:'getHsmpFacilityMntncCostInfoV3',columns:{facility:['lrefCost2']}},
 {service:'common',op:'getHsmpSafetyCheckUpCostInfoV3',columns:{safety_check:['lrefCost3']}},
 {service:'common',op:'getHsmpDisasterPreventionCostInfoV3',columns:{disaster:['lrefCost4']}},
 {service:'common',op:'getHsmpConsignManageFeeInfoV3',columns:{consign:['manageCost']}},
 {service:'individual',op:'getHsmpHeatCostInfoV3',columns:{heat_private:['heatP'],heat_common:['heatC']}},
 {service:'individual',op:'getHsmpHotWaterCostInfoV3',columns:{hot_water_private:['waterHotP'],hot_water_common:['waterHotC']}},
 {service:'individual',op:'getHsmpGasRentalFeeInfoV3',columns:{gas_private:['gasP'],gas_common:['gasC']}},
 {service:'individual',op:'getHsmpElectricityCostInfoV3',columns:{electric_private:['electP'],electric_common:['electC']}},
 {service:'individual',op:'getHsmpWaterCostInfoV3',columns:{water_private:['waterCoolP'],water_common:['waterCoolC']}},
 {service:'individual',op:'getHsmpDomesticWasteFeeInfoV3',columns:{waste:['scrap']}},
 {service:'individual',op:'getHsmpMovingInRepresentationMtgInfoV3',columns:{resident_meeting:['preMeet']}},
 {service:'individual',op:'getHsmpBuildingInsuranceFeeInfoV3',columns:{insurance:['buildInsu']}},
 {service:'individual',op:'getHsmpElectionOrpnsInfoV3',columns:{election:['electionMng']}},
 {service:'individual',op:'getHsmpWaterPurifierTankFeeInfoV3',columns:{septic:['purifi']}},
 {service:'reserve',op:'getHsmpMonthFeeInfoV3',columns:{reserve_levy:['sLevy']}},
 {service:'reserve',op:'getHsmpMonthRetalFeeInfoV3',columns:{reserve_used:['sUse']}},
 {service:'reserve',op:'getHsmpReserveBalanceInfoV3',columns:{reserve_balance:['sTot']}},
 {service:'reserve',op:'getHsmpAccumulationTariffInfoV3',columns:{reserve_rate:['sPer']},decimal:true},
];
export const feeUrl=o=>`https://apis.data.go.kr/1613000/${SERVICES[o.service]}/${o.op}`;
const COMMON=['labor','office','tax','clothing','training','vehicle','other_overhead','cleaning','guard','disinfection','elevator','home_network','repairs','facility','safety_check','disaster','consign'];
const INDIVIDUAL=['heat_private','heat_common','hot_water_private','hot_water_common','gas_private','gas_common','electric_private','electric_common','water_private','water_common','waste','resident_meeting','insurance','election','septic'];
const total=(row,cols)=>{const v=cols.map(c=>row[c]).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0):null;};
// answers: {opName: item|null}; complex: {management_area, households}.
export function feeRow(kapt,ym,answers,complex,fetchedAt){
 const row={kapt_code:kapt,ym:`${ym.slice(0,4)}-${ym.slice(4,6)}`};
 for(const o of FEE_OPS){
  const item=answers[o.op];
  for(const [col,fields] of Object.entries(o.columns)){
   const vals=item?fields.map(f=>o.decimal?num(item[f]):whole(item[f])).filter(x=>x!=null):[];
   row[col]=vals.length?vals.reduce((a,b)=>a+b,0):null;
  }
 }
 row.common_total=total(row,COMMON);
 row.individual_total=total(row,INDIVIDUAL);
 const area=Number(complex?.management_area)>0?Number(complex.management_area):null,hh=Number(complex?.households)>0?Number(complex.households):null;
 row.management_area=area;row.households=hh;
 const whole_=(row.common_total??0)+(row.individual_total??0)+(row.reserve_levy??0);
 row.total=row.common_total==null&&row.individual_total==null?null:whole_;
 row.common_per_m2=area&&row.common_total!=null?Math.round(row.common_total/area):null;
 row.total_per_m2=area&&row.total!=null?Math.round(row.total/area):null;
 row.total_per_household=hh&&row.total!=null?Math.round(row.total/hh):null;
 row.fetched_at=fetchedAt;
 return row;
}
// Latest month K-APT should have: filings close about a month and a half after the month ends.
export function monthsBefore(now,count,skip=1){
 const [y,m]=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(now).split('-').map(Number);
 return Array.from({length:count},(_,i)=>{const d=new Date(Date.UTC(y,m-1-skip-i,1));return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}`;});
}

// ---- 건축물대장 표제부 → one row per 주건축물 housing building.
// The register holds dates like 19980500 (day unknown), which aren't dates.
export function registerDate(v){
 const s=clean(v);if(!/^\d{8}$/.test(s??''))return null;
 const [y,m,d]=[s.slice(0,4),s.slice(4,6),s.slice(6,8)].map(Number);
 const t=new Date(Date.UTC(y,m-1,d));
 return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:null;
}
const isHousing=i=>String(i.mainPurpsCd??'').startsWith('02')||/아파트|공동주택/.test(`${i.mainPurpsCdNm??''} ${i.etcPurps??''}`);
const isMain=i=>String(i.mainAtchGbCd??'0').trim()==='0';
export function buildingRows(kapt,pnu,items){
 const seen=new Set(),rows=[];
 for(const i of items){
  if(!isMain(i)||!isHousing(i))continue;
  const pk=clean(i.mgmBldrgstPk);
  if(!pk||seen.has(pk))continue;
  seen.add(pk);
  rows.push({kapt_code:kapt,register_pk:pk,pnu,dong_name:clean(i.dongNm),building_name:clean(i.bldNm),main_purpose:clean(i.mainPurpsCdNm),
   ground_floors:whole(i.grndFlrCnt),basement_floors:whole(i.ugrndFlrCnt),households:whole(i.hhldCnt)||whole(i.hoCnt),height_m:num(i.heit),
   elevators:(whole(i.rideUseElvtCnt)??0)+(whole(i.emgenUseElvtCnt)??0),structure:clean(i.strctCdNm),
   approved_on:registerDate(i.useAprDay)});
 }
 return rows;
}
const nameOf=s=>(s??'').toLowerCase().replace(/\s+/g,'').replace(/[()·,.\-]/g,'').replace(/아파트/g,'');
// On a lot several complexes share, a building belongs to the complex whose name it carries.
export const nameMatches=(complexName,buildingName)=>{const a=nameOf(complexName),b=nameOf(buildingName);return a.length>=2&&b.length>=2&&(a.includes(b)||b.includes(a));};

// ---- 위치: distance and a simple grid so 10,000 complexes × 50,000 points stays fast.
export function metres(aLat,aLon,bLat,bLon){
 const R=6371000,toRad=d=>d*Math.PI/180;
 const x=toRad(bLon-aLon)*Math.cos(toRad((aLat+bLat)/2)),y=toRad(bLat-aLat);
 return Math.round(Math.sqrt(x*x+y*y)*R);
}
export function gridIndex(points,cell=0.01){
 const m=new Map();
 for(const p of points){const k=`${Math.floor(p.lat/cell)}|${Math.floor(p.lon/cell)}`;let l=m.get(k);if(!l)m.set(k,l=[]);l.push(p);}
 return {m,cell};
}
export function nearby({m,cell},lat,lon,radius){
 const out=[],span=Math.ceil(radius/(cell*88000));
 const [y,x]=[Math.floor(lat/cell),Math.floor(lon/cell)];
 for(let i=y-span;i<=y+span;i++)for(let j=x-span;j<=x+span;j++){
  for(const p of m.get(`${i}|${j}`)??[]){const d=metres(lat,lon,p.lat,p.lon);if(d<=radius)out.push({p,d});}
 }
 return out.sort((a,b)=>a.d-b.d);
}

// ---- 버스
export function parseCsv(text){
 const rows=[];let row=[],cur='',q=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(q){if(c==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=c;}
  else if(c==='"')q=true;
  else if(c===','){row.push(cur);cur='';}
  else if(c==='\n'){row.push(cur.replace(/\r$/,''));rows.push(row);row=[];cur='';}
  else cur+=c;
 }
 if(cur||row.length){row.push(cur);rows.push(row);}
 return rows;
}
const validPoint=(lat,lon)=>lat>33&&lat<39&&lon>124&&lon<132;
// TAGO file: 정류장번호,정류장명,위도,경도,정보수집일,모바일단축번호,도시코드,도시명,관리도시명
export function tagoStops(rows,sidoNames){
 const out=[];
 for(const r of rows.slice(1)){
  const [id,name,lat,lon,,short,cityCode,city]=r;
  const sido=sidoNames.find(s=>(city??'').startsWith(s));
  if(!sido||!clean(id))continue;
  const [la,lo]=[Number(lat),Number(lon)];
  if(!validPoint(la,lo))continue;
  out.push({id:id.trim(),name:clean(name),lat:la,lon:lo,city:clean(city),sido,city_code:clean(cityCode),ars_no:clean(short),source:'tago'});
 }
 return out;
}
const stopKey=s=>(s??'').replace(/[\s.·()]/g,'');
// Stops another source already lists: a TAGO stop within `radius` of a same-named 서울 stop is the same pole.
export function mergeStops(primary,others,radius=40){
 const idx=gridIndex(primary),aliases=new Map(),kept=[];
 for(const s of others){
  const twin=nearby(idx,s.lat,s.lon,radius).find(({p})=>stopKey(p.name)===stopKey(s.name));
  if(twin)aliases.set(s.id,twin.p.id);else kept.push(s);
 }
 return {stops:[...primary,...kept],aliases};
}
export const isExpressRoute=type=>/광역|직행좌석/.test(type??'');

// ---- 학교알리미 (공시 항목 이름은 OpenAPI_Output.xlsx 기준)
export const SCHOOL_KINDS={'02':'elementary','03':'middle','04':'high'};
export function schoolRow(b,stat,year){
 const code=clean(b.SCHUL_CODE);if(!code)return null;
 const [lat,lon]=[num(b.LTTUD),num(b.LGTUD)];
 return {school_code:code,name:clean(b.SCHUL_NM),kind:SCHOOL_KINDS[clean(b.SCHUL_KND_SC_CODE)]??null,region_code:clean(b.ADRCD_CD),address:clean(b.SCHUL_RDNMA)??clean(b.ADRES_BRKDN),
  founding:clean(b.FOND_SC_CODE),coed:clean(b.COEDU_SC_CODE),latitude:lat&&validPoint(lat,lon)?lat:null,longitude:lat&&validPoint(lat,lon)?lon:null,
  year,classes:whole(stat?.COL_C_SUM),students:whole(stat?.COL_S_SUM),students_per_class:num(stat?.COL_SUM),
  grade_students_per_class:stat?Object.fromEntries([1,2,3,4,5,6].map(g=>[g,num(stat[`COL_${g}`])]).filter(([,v])=>v!=null)):null};
}

export const schoolStem=name=>(name??'').replace(/\s+/g,'').replace(/초등학교$|초등$|초$/,'');
export const sameSchoolStem=(a,b)=>a.length>=2&&b.length>=2&&(a===b||a.endsWith(b)||b.endsWith(a));

// ---- 어린이집·유치원
const CHILDCARE_TYPES=[['국공립','public'],['사회복지','welfare'],['법인','corporate'],['단체','corporate'],['민간','private'],['가정','home'],['협동','cooperative'],['직장','workplace']];
export const childcareType=name=>CHILDCARE_TYPES.find(([k])=>(name??'').includes(k))?.[1]??'other';
// 어린이집정보공개포털 '어린이집 기본정보' result page → one object per row, keyed by the page's own column names.
const cellText=h=>h.replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
export function parseChildcareSheet(html){
 const thead=html.match(/<thead>([\s\S]*?)<\/thead>/)?.[1];
 if(!thead)throw Error('CHILDCARE_SHEET_NO_HEAD');
 const head=[...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(m=>cellText(m[1]));
 for(const need of ['어린이집명','어린이집유형구분','운영현황','정원수','위도','경도'])if(!head.includes(need))throw Error(`CHILDCARE_SHEET_COLUMN:${need}`);
 const body=html.slice(html.indexOf('</thead>'));
 return [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c=>cellText(c[1]))).filter(c=>c.length>=head.length-1).map(c=>Object.fromEntries(head.map((h,i)=>[h,c[i]??''])));
}
// The sheet has no facility code, so the id hashes what identifies a place: where, what, and when it was licensed.
export function childcareRow(r,sido){
 const name=clean(r['어린이집명']);if(!name)return null;
 const [lat,lon]=[num(r['위도']),num(r['경도'])];
 const id=createHash('sha1').update([sido,r['시군구'],name,clean(r['인가일자'])??'',clean(r['주소'])??''].join('|')).digest('hex').slice(0,20);
 return {id:`cc:${id}`,kind:'daycare',name,type_name:clean(r['어린이집유형구분']),type_code:childcareType(r['어린이집유형구분']),status:clean(r['운영현황']),sido,sigungu:clean(r['시군구']),address:clean(r['주소']),
  capacity:whole(r['정원수']),current_children:whole(r['현원수']),latitude:lat&&validPoint(lat,lon)?lat:null,longitude:lat&&validPoint(lat,lon)?lon:null};
}
const KINDER_TYPES=[['국립','public'],['공립','public'],['사립','private']];
export function kinderRow(r,sido,sigungu){
 const id=clean(r.kindercode??r.kinderCode);if(!id)return null;   // the answer says kindercode, the manual kinderCode
 const [lat,lon]=[num(r.lttdcdnt),num(r.lngtcdnt)];
 const children=['ppcnt3','ppcnt4','ppcnt5','mixppcnt','shppcnt'].map(k=>whole(r[k])??0).reduce((a,b)=>a+b,0);
 return {id:`kg:${id}`,kind:'kindergarten',name:clean(r.kindername),type_name:clean(r.establish),type_code:KINDER_TYPES.find(([k])=>(r.establish??'').includes(k))?.[1]??'other',status:null,sido,sigungu,address:clean(r.addr),
  capacity:whole(r.prmstfcnt),current_children:children||null,latitude:lat&&validPoint(lat,lon)?lat:null,longitude:lat&&validPoint(lat,lon)?lon:null};
}

// Daily schedule. From 07:00 to 07:30 it runs ahead of the market job; a later start is the day's only run and goes after that job.
export const DETAIL_START=7*60,DETAIL_CUTOFF=7.5*60,DETAIL_LATEST=23*60;
export function schedulePlan({minutes,day,ranDay,lease}){
 if(ranDay===day)return 'ran-today';
 if(minutes<DETAIL_START)return 'too-early';   // the 07:00 trigger will start it; also clear of any night run
 if(minutes>=DETAIL_LATEST)return 'too-late';  // too little of the day left, and fees must stop before midnight
 return minutes<DETAIL_CUTOFF&&!lease?'morning':'late';
}
// lease: today's market row, null when there is none yet, undefined when it could not be read.
export const MARKET_GRACE=15*60e3,MARKET_WAIT_LIMIT=4*3600e3;
export function marketGate({lease,lockBusy,nowMs,waitedMs}){
 const running=lockBusy||(lease?.status==='running'&&Date.parse(lease.lease_until)>nowMs);
 if(!running&&lease)return 'go';                                 // finished or failed, or its PC went quiet
 if(!running&&lease===null&&waitedMs>=MARKET_GRACE)return 'go';  // it did not start on this PC or any other
 return waitedMs>=MARKET_WAIT_LIMIT?'give-up':'wait';
}
