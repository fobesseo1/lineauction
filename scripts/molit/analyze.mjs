// Link apartment-section auction/public-sale properties to MOLIT buildings and write the
// 실거래 대비 할인율 into public.property_analysis.
//   node scripts/molit/analyze.mjs [--dry-run]
// discount_rate = (1 - 최저가 / 기준 시세) × 100, 기준 시세 = median of valid same-type sales
// (6 months when there are 3, else 12). Cancelled and 직거래 sales never count.
import {DatabaseSync} from 'node:sqlite';
import {createClient} from '@supabase/supabase-js';
import {regionCode} from '../court/regions.mjs';
import {placeId} from './summary.mjs';
import {tradeKind,pnuLot,courtAddress,findPlace,marketPrice,shopFloor,outlier,dealScore,villaPrice,sameDong} from './match.mjs';
import {commercialKind,floorClass,landPrice,housePrice,unitPrice,buildingPrice,houseIncome} from './commercial.mjs';
process.loadEnvFile('.env.local');

const dryRun=process.argv.includes('--dry-run');
const runAt=new Date().toISOString();
const kstDay=offsetMonths=>{const d=new Date(Date.now()+9*3600000);d.setUTCMonth(d.getUTCMonth()-offsetMonths);return d.toISOString().slice(0,10);};
const since={3:kstDay(3),6:kstDay(6),12:kstDay(12)};
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});

// Buildings indexed by kind + 시군구.
const placesBy=new Map();
for(const r of wh.prepare('select distinct kind,lawd,umd,jibun,name from trades where umd is not null and jibun is not null').iterate()){
 const k=`${r.kind}:${r.lawd}`;const list=placesBy.get(k)??[];
 if(!list.some(p=>p.umd===r.umd&&p.jibun===r.jibun))list.push({...r,id:placeId(r.kind,r.lawd,r.umd,r.jibun)});
 placesBy.set(k,list);
}
const salesOf=wh.prepare(`select deal_date,amount,area from trades where kind=? and lawd=? and umd=? and jibun=? and deal='sale'
 and cancel_date is null and coalesce(dealing,'')<>'직거래' and amount is not null and deal_date>=?`);

// 빌라: same-building sales and, per 시군구, all villa sales for the dong comparison.
const villaBuilding=wh.prepare(`select deal_date,amount,area,build_year,land_area from trades where kind='rh' and lawd=? and umd=? and jibun=? and deal='sale'
 and cancel_date is null and coalesce(dealing,'')<>'직거래' and amount is not null and deal_date>=?`);
const villaLawd=wh.prepare(`select umd,deal_date,amount,area,build_year,land_area from trades where kind='rh' and lawd=? and deal='sale'
 and cancel_date is null and coalesce(dealing,'')<>'직거래' and amount is not null and deal_date>=?`);
const villaLawdCache=new Map();
const villaSalesIn=lawd=>{if(!villaLawdCache.has(lawd))villaLawdCache.set(lawd,villaLawd.all(lawd,since[12]));return villaLawdCache.get(lawd);};

// 시군구 code(s) from the start of a court address ("경기도 용인시 처인구 ...").
function lawdsOf(address){
 const t=String(address??'').split(/\s+/);
 for(const n of [3,2]){const code=regionCode(t.slice(0,n).join(' '));if(code)return String(code).split(',');}
 return [];
}

// Only the round a person can bid on now; later Onbid rounds carry lower future minimums.
const refreshed=await supa.rpc('refresh_current_rounds');if(refreshed.error)throw Error(refreshed.error.message);
const properties=[];
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('properties').select('id,source,usage_type,section,address,sido,dong,pnu,exclusive_area,building_area,land_area,build_year,minimum_bid_price,appraisal_price,risk_flags,failed_bid_count')
  .eq('section','apartment').eq('is_current',true).in('sido',['서울특별시','경기도','인천광역시']).order('id').range(from,from+999);
 if(error)throw Error(error.message);properties.push(...data);if(data.length<1000)break;
}

const rows=[],stats={properties:properties.length,eligible:0,linked:0,priced:0,via:{},confidence:{}};
for(const p of properties){
 const kind=tradeKind(p.usage_type,p.section);if(!kind||shopFloor(p.usage_type,p.address))continue;
 const area=Number(p.exclusive_area??p.building_area);
 if(!(area>0))continue;
 stats.eligible++;
 let hit=null;
 if(p.source==='onbid'){
  const lot=pnuLot(p.pnu);
  if(lot)hit=findPlace(placesBy.get(`${kind}:${lot.lawd}`)??[],{lawd:lot.lawd,dong:p.dong,jibun:lot.jibun,kind});
 }else{
  const a=courtAddress(p.address);
  for(const lawd of lawdsOf(p.address)){hit=findPlace(placesBy.get(`${kind}:${lawd}`)??[],{lawd,...a,kind});if(hit)break;}
 }
 if(kind==='rh'){
  // Building methodology: same building first, else the same 법정동 by price per ㎡.
  const lawd=p.source==='onbid'?pnuLot(p.pnu)?.lawd:(hit?.place.lawd??lawdsOf(p.address)[0]);
  const dong=hit?.place.umd??(p.source==='onbid'?p.dong:courtAddress(p.address).dong);
  if(!lawd||!dong)continue;
  const building=hit?villaBuilding.all(lawd,hit.place.umd,hit.place.jibun,since[12]):[];
  const market=villaPrice({area,landArea:Number(p.land_area)||null,building,dong:villaSalesIn(lawd).filter(s=>sameDong(s.umd,dong)),buildYear:p.build_year??building[0]?.build_year??null,since12:since[12]});
  if(!market)continue;
  stats.linked++;stats.priced++;stats.villa=(stats.villa??0)+1;
  const minimum=Number(p.minimum_bid_price),appraisal=Number(p.appraisal_price),marketWon=market.priceManwon*10000;
  const pct=v=>v==null||!Number.isFinite(v)?null:Math.round(v*10)/10;
  const discount=minimum>0?pct((1-minimum/marketWon)*100):null;
  const confidence=outlier(discount)?'low':market.confidence;
  const deal=dealScore({discount,confidence,riskFlags:p.risk_flags,failedBids:p.failed_bid_count??0});
  rows.push({
   property_id:p.id,place_id:null,area_type:Math.floor(area),confidence,deal_score:deal?.score??null,deal_grade:deal?.grade??null,
   market_price:marketWon,market_price_method:`villa-${market.basis}-12m`,
   appraisal_ratio:appraisal>0&&minimum>0?pct(minimum/appraisal*100):null,
   market_ratio:minimum>0?pct(minimum/marketWon*100):null,discount_rate:discount,
   estimated_price_gap:minimum>0?marketWon-minimum:null,
   transaction_count_3m:null,transaction_count_6m:null,transaction_count_12m:market.count,
   score_breakdown:{via:hit?.via??'dong',window:12,sample:market.count,basis:market.basis,villaBuilding:hit?.place.id??null,score:deal?.breakdown??null},
   calculated_at:runAt,
  });
  continue;
 }
 if(!hit)continue;
 stats.linked++;stats.via[hit.via]=(stats.via[hit.via]??0)+1;
 const {place}=hit,areaType=Math.floor(area);
 const all=salesOf.all(place.kind,place.lawd,place.umd,place.jibun,since[12]);
 const byType=new Map();for(const s of all){const t=Math.floor(s.area);byType.set(t,[...(byType.get(t)??[]),s]);}
 let type=areaType,market=marketPrice(byType.get(areaType)??[],{since6:since[6],since12:since[12]});
 if(!market){
  // Same building, neighbouring 평형 type (±1㎡) with the most sales.
  const near=[areaType-1,areaType+1].filter(t=>byType.get(t)?.length).sort((a,b)=>byType.get(b).length-byType.get(a).length)[0];
  if(near!==undefined){type=near;market=marketPrice(byType.get(near),{since6:since[6],since12:since[12],neighbour:true});}
 }
 const typeSales=byType.get(type)??[];
 const count=m=>typeSales.filter(s=>s.deal_date>=since[m]).length;
 const minimum=Number(p.minimum_bid_price),appraisal=Number(p.appraisal_price);
 const marketWon=market?market.priceManwon*10000:null;
 const pct=v=>v==null||!Number.isFinite(v)?null:Math.round(v*10)/10;
 if(market)stats.priced++,stats.confidence[market.confidence]=(stats.confidence[market.confidence]??0)+1;
 const discount=marketWon&&minimum>0?pct((1-minimum/marketWon)*100):null;
 const confidence=market?(outlier(discount)?'low':market.confidence):null;
 const deal=dealScore({discount,confidence,riskFlags:p.risk_flags,failedBids:p.failed_bid_count??0});
 rows.push({
  property_id:p.id,place_id:place.id,area_type:type,confidence,deal_score:deal?.score??null,deal_grade:deal?.grade??null,
  market_price:marketWon,market_price_method:market?`median-${market.window}m`:'no-recent-sales',
  appraisal_ratio:appraisal>0&&minimum>0?pct(minimum/appraisal*100):null,
  market_ratio:marketWon&&minimum>0?pct(minimum/marketWon*100):null,
  discount_rate:discount,
  estimated_price_gap:marketWon&&minimum>0?marketWon-minimum:null,
  transaction_count_3m:count(3),transaction_count_6m:count(6),transaction_count_12m:count(12),
  score_breakdown:{via:hit.via,window:market?.window??null,sample:market?.count??0,neighbourType:type!==areaType,score:deal?.breakdown??null},
  calculated_at:runAt,
 });
}
// ---- 상가·건물·토지 section (2단계): land, 단독·다가구, shop units and whole buildings.
const commercialProps=[];
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('properties').select('id,source,usage_type,title,section,address,dong,pnu,exclusive_area,building_area,land_area,build_year,minimum_bid_price,appraisal_price,risk_flags,failed_bid_count')
  .eq('section','commercial').eq('is_current',true).in('sido',['서울특별시','경기도','인천광역시']).order('id').range(from,from+999);
 if(error)throw Error(error.message);commercialProps.push(...data);if(data.length<1000)break;
}
const parcels=new Map();
for(let from=0;;from+=1000){const {data,error}=await supa.from('parcel_info').select('pnu,zone,plot_area,land_price_per_m2,total_floor_area').range(from,from+999);if(error)throw Error(error.message);data.forEach(r=>parcels.set(r.pnu,r));if(data.length<1000)break;}
const KIND={land:'land',house:'sh',unit:'nrg',building:'nrg'},MONTHS={land:24,house:24,unit:36,building:36};
const tradesIn=wh.prepare(`select umd,jibun,area,land_area,total_floor_area,zone,use_type,building_type,floor,build_year,amount,dealing,cancel_date,share,deal_date
 from trades where kind=? and lawd=? and deal='sale' and deal_date>=?`);
const tradeCache=new Map();
const rentsIn=wh.prepare(`select umd,area,deposit,monthly_rent from trades where kind='sh' and lawd=? and deal='rent' and deal_date>=?`);
const rentCache=new Map();
const houseRents=lawd=>{if(!rentCache.has(lawd))rentCache.set(lawd,rentsIn.all(lawd,kstDay(24)));return rentCache.get(lawd);};
const sinceMonths=m=>kstDay(m);
const tradesFor=(kind,lawd,months)=>{const k=`${kind}:${lawd}:${months}`;if(!tradeCache.has(k))tradeCache.set(k,tradesIn.all(kind,lawd,sinceMonths(months)));return tradeCache.get(k);};
stats.commercial={eligible:0,priced:0,basis:{}};
for(const p of commercialProps){
 const text=`${p.address??''} ${p.title??''}`;
 const ck=commercialKind(p.usage_type,text);if(!ck)continue;
 let lawd=null,dong=p.dong,jibun=null;
 if(p.source==='onbid'){const lot=pnuLot(p.pnu);lawd=lot?.lawd??null;jibun=lot?.jibun??null;}
 else{lawd=lawdsOf(p.address)[0]??null;const a=courtAddress(p.address);dong=a.dong??dong;jibun=a.jibun;}
 if(!lawd||!dong)continue;
 stats.commercial.eligible++;
 const all=tradesFor(KIND[ck],lawd,MONTHS[ck]);
 const inDong=all.filter(t=>sameDong(t.umd,dong));
 const parcel=parcels.get(p.pnu);
 const area=Number(p.exclusive_area??p.building_area);
 let market=null,income=null;
 if(ck==='land')market=landPrice({area:Number(p.land_area),zone:parcel?.zone,jimok:p.usage_type,dong:inDong,lawd:all,officialPerM2:Number(parcel?.land_price_per_m2)||null});
 else if(ck==='house'){
  market=housePrice({landArea:Number(p.land_area),buildYear:p.build_year,dong:inDong,lawd:all});
  income=houseIncome({rents:houseRents(lawd).filter(t=>sameDong(t.umd,dong)),sales:inDong,floorArea:Number(parcel?.total_floor_area)||null});
  // Too few comparable plots: fall back to the dong's price per ㎡ of floor area × this house's 연면적.
  if(!market&&income?.floorPrice)market={priceManwon:income.floorPrice,count:income.sales,confidence:'low',basis:'house-floor'};
 }
 else if(ck==='unit')market=unitPrice({area,floor:floorClass(text),use:p.usage_type,building:jibun?inDong.filter(t=>t.jibun===jibun):[],dong:inDong});
 else market=buildingPrice({plotArea:Number(parcel?.plot_area??p.land_area),zone:parcel?.zone,dong:inDong,lawd:all});
 if(!market)continue;
 stats.commercial.priced++;stats.commercial.basis[market.basis]=(stats.commercial.basis[market.basis]??0)+1;
 const minimum=Number(p.minimum_bid_price),appraisal=Number(p.appraisal_price),marketWon=market.priceManwon*10000;
 const pct=v=>v==null||!Number.isFinite(v)?null:Math.round(v*10)/10;
 const discount=minimum>0?pct((1-minimum/marketWon)*100):null;
 // v1: land, houses, shops and buildings vary too much for a comparable set to be more than a
 // reference, so every 2단계 price is shown as 참고용 (low) whatever the sample size.
 const confidence='low';
 const deal=dealScore({discount,confidence,riskFlags:p.risk_flags,failedBids:p.failed_bid_count??0});
 rows.push({
  property_id:p.id,place_id:null,area_type:ck==='unit'&&area>0?Math.floor(area):null,confidence,deal_score:deal?.score??null,deal_grade:deal?.grade??null,
  market_price:marketWon,market_price_method:`${market.basis}-${MONTHS[ck]}m`,
  appraisal_ratio:appraisal>0&&minimum>0?pct(minimum/appraisal*100):null,
  market_ratio:minimum>0?pct(minimum/marketWon*100):null,discount_rate:discount,
  estimated_price_gap:minimum>0?marketWon-minimum:null,
  transaction_count_3m:null,transaction_count_6m:null,transaction_count_12m:market.count,
  score_breakdown:{via:market.basis,kind:ck,window:MONTHS[ck],sample:market.count,score:deal?.breakdown??null,...(income?{income}:{})},
  calculated_at:runAt,
 });
}

console.log(JSON.stringify(stats));
if(dryRun){wh.close();process.exit(0);}

for(let i=0;i<rows.length;i+=500){
 const {error}=await supa.from('property_analysis').upsert(rows.slice(i,i+500),{onConflict:'property_id'});
 if(error)throw Error(`property_analysis: ${error.message}`);
}
// Analyses for properties that no longer link (or left the section) are removed.
for(;;){
 const {data,error}=await supa.from('property_analysis').select('id').lt('calculated_at',runAt).limit(500);
 if(error)throw Error(error.message);if(!data.length)break;
 const del=await supa.from('property_analysis').delete().in('id',data.map(r=>r.id));if(del.error)throw Error(del.error.message);
}
// Linked apartments/officetels without a register year take their building's 건축연도.
const filled=await supa.rpc('fill_build_year_from_places');if(filled.error)throw Error(filled.error.message);
console.log(`ANALYZED ${rows.length}, build years filled ${filled.data}`);
wh.close();
