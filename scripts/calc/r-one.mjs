// 한국부동산원 상업용부동산 임대동향조사 (R-ONE Open API) → public.calc_constants, for the price
// calculator's income approach on 상가·오피스.
//   node scripts/calc/r-one.mjs
// Keys: commercial.office / .large_shop (중대형) / .small_shop (소규모) / .unit_shop (집합).
// value = {quarter, regions: {"서울": {...}, "서울>강남>테헤란로": {...}}} for 서울·경기·인천 and their 상권:
//   rent (천원/㎡·월), vacancy (%), conversion (%), income_yield / capital_yield (% per year,
//   the last four quarters added up), floor_ratio ({층: 1층=100 효용비율}) where published.
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');

export const TABLES={
 office:{label:'오피스',yield:'T245883135037859',rent:'TT249843134237374',vacancy:'TT244763134428698',conversion:'TT243613134435838',floor:'TT242293134242089'},
 large_shop:{label:'중대형 상가',yield:'T242083134887473',rent:'T244363134858603',vacancy:'T249633134845544',conversion:'T241883134877452',floor:'T241873134863890'},
 small_shop:{label:'소규모 상가',yield:'T246253134913401',rent:'T248223134698125',vacancy:'T241833134686576',conversion:'T246253134905233',floor:'T246233134891629'},
 unit_shop:{label:'집합 상가',yield:'T246393134978815',rent:'T244913134948657',vacancy:'T243283134931290',conversion:'T243133134985812',floor:'T249023134703697'},
};
export const CAPITAL=/^(서울|경기|인천)(>|$)/;
const round=v=>v==null?null:Math.round(v*100)/100;

async function rows(id){
 const out=[];
 for(let page=1;;page++){
  const u=`https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?Type=json&pSize=1000&pIndex=${page}&DTACYCLE_CD=QY&STATBL_ID=${id}&KEY=${process.env.R_ONE_API_KEY}`;
  const j=await (await fetch(u,{signal:AbortSignal.timeout(60000)})).json();
  const head=j.SttsApiTblData?.[0]?.head;
  if(!head){if(j.RESULT?.CODE==='INFO-200')return out;throw Error(`${id}: ${j.RESULT?.MESSAGE??JSON.stringify(j).slice(0,200)}`);}
  const list=j.SttsApiTblData[1]?.row??[];out.push(...list);
  if(out.length>=head[0].list_total_count||!list.length)return out;
 }
}

// Latest quarter's value per region for one item, plus the last-four-quarter sum for yields.
export function latest(list,item,{sum4=false}={}){
 const mine=list.filter(r=>r.ITM_NM===item&&CAPITAL.test(r.CLS_FULLNM));
 const quarters=[...new Set(mine.map(r=>r.WRTTIME_IDTFR_ID))].sort();
 const last=quarters.at(-1),window=quarters.slice(-4);
 const out={};
 for(const r of mine){
  if(sum4?!window.includes(r.WRTTIME_IDTFR_ID):r.WRTTIME_IDTFR_ID!==last)continue;
  out[r.CLS_FULLNM]=(sum4?(out[r.CLS_FULLNM]??0):0)+Number(r.DTA_VAL);
 }
 // A yield summed over fewer than four quarters would understate the year.
 if(sum4&&window.length<4)return {quarter:last,values:{}};
 return {quarter:last,values:Object.fromEntries(Object.entries(out).map(([k,v])=>[k,round(v)]))};
}

if(import.meta.url===`file:///${process.argv[1].replace(/\\/g,'/')}`){
 const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const upserts=[];
 for(const [key,t] of Object.entries(TABLES)){
  const [y,rent,vac,conv,floor]=[await rows(t.yield),await rows(t.rent),await rows(t.vacancy),await rows(t.conversion),await rows(t.floor)];
  const parts={rent:latest(rent,'임대료'),vacancy:latest(vac,'공실률'),conversion:latest(conv,'전환율'),
   income_yield:latest(y,'소득수익률',{sum4:true}),capital_yield:latest(y,'자본수익률',{sum4:true})};
  const regions={};
  for(const [field,{values}] of Object.entries(parts))for(const [region,v] of Object.entries(values))(regions[region]??={})[field]=v;
  // 층별효용비율: here the region is the group (GRP_FULLNM) and the floor is the class ("1층",
  // "지하1층", "6층이상"), relative to the first floor = 100.
  const floorItems=floor.filter(r=>r.ITM_NM==='효용비율'&&CAPITAL.test(r.GRP_FULLNM??''));
  const fq=[...new Set(floorItems.map(r=>r.WRTTIME_IDTFR_ID))].sort().at(-1);
  for(const r of floorItems)if(r.WRTTIME_IDTFR_ID===fq&&regions[r.GRP_FULLNM])
   (regions[r.GRP_FULLNM].floor_ratio??={})[r.CLS_NM]=round(Number(r.DTA_VAL));
  const quarter=parts.rent.quarter;
  upserts.push({key:`commercial.${key}`,value:{label:t.label,quarter,regions},unit:'임대료 천원/㎡·월, 나머지 %',
   as_of:quarter?`${quarter.slice(0,4)}-${String(Number(quarter.slice(4))*3).padStart(2,'0')}-01`:new Date().toISOString().slice(0,10),
   source:'한국부동산원 상업용부동산 임대동향조사 (R-ONE)',source_url:'https://www.reb.or.kr/r-one',
   note:'수도권 시도와 상권별 최신 분기. income_yield·capital_yield는 최근 4분기 합(연간). floor_ratio는 1층=100 기준 층별효용비율. 상권 이름은 CLS_FULLNM(시도>권역>상권)',
   updated_at:new Date().toISOString()});
  console.log(key,quarter,'regions',Object.keys(regions).length,'floorItems',floorItems.length);
 }
 const {error}=await supa.from('calc_constants').upsert(upserts,{onConflict:'key'});
 if(error)throw Error(error.message);
 console.log('DONE');
}
