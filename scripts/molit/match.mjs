// Pure rules linking an auction/public-sale property to a MOLIT building (market place) and
// turning that building's sales into a discount. Amounts from MOLIT are 만원; properties are 원.
import {normalizeName,median} from './summary.mjs';

// Which MOLIT dataset a property's use is filed under (rh = 연립·다세대, compared by villaPrice).
export function tradeKind(usage,section){
 const u=String(usage??'');
 if(section!=='apartment')return null;
 if(/오피스텔/.test(u))return 'offi';
 if(/^(아파트|도시형생활주택|주상복합)$/.test(u))return 'apt';
 if(VILLA_USES.test(u))return 'rh';
 return null;
}

// A MOLIT umdNm ("하길리", "향남읍 하길리", "잠실동") agrees with a property's dong in either form.
export const sameDong=(umd,dong)=>!!dong&&(umd===dong||umd.endsWith(` ${dong}`)||umd.startsWith(`${dong} `));

// Lot from a PNU: "1154510200009730001" → {lawd:'11545', jibun:'973-1'}; 산 lots get the "산" prefix.
export function pnuLot(pnu){
 if(!/^\d{19}$/.test(pnu??''))return null;
 const main=Number(pnu.slice(11,15)),sub=Number(pnu.slice(15,19));
 if(!main)return null;
 return {lawd:pnu.slice(0,5),jibun:`${pnu[10]==='2'?'산':''}${main}${sub?`-${sub}`:''}`};
}

// Court address → dong, lot and complex name hints.
//   "서울특별시 구로구 온수동 86-10 에코그린빌 제102동 제4층 제401호"
//   "경기도 용인시 처인구 모현읍 왕산리 551-22 5층501호"
//   "경기도 성남시 분당구 정자일로 95 101동 3층 (정자동,아이파크분당)"
export function courtAddress(address){
 const a=String(address??'').split(' / ')[0];
 const lot=a.match(/(?:^|\s)([가-힣0-9]+(?:동|가|리))\s+(산\s*)?(\d{1,5}(?:-\d{1,5})?)(?=\s|,|$)/);
 const paren=a.match(/\(([^()]*)\)\s*$/);
 const parts=paren?paren[1].split(',').map(s=>s.trim()).filter(Boolean):[];
 const parenDong=parts.find(p=>/(?:동|가|리)$/.test(p)&&!/\d+동$/.test(p))??null;
 const parenName=parts.find(p=>p!==parenDong)??null;
 return {dong:lot?.[1]??parenDong,jibun:lot?`${lot[2]?'산':''}${lot[3]}`:null,name:parenName};
}

// Pick the building: by lot first, then by complex name inside the 시군구 (and dong if known).
export function findPlace(places,{lawd,dong,jibun,name,kind}){
 const inLawd=places.filter(p=>p.lawd===lawd&&p.kind===kind);
 if(jibun){
  const byLot=inLawd.filter(p=>p.jibun===jibun&&(!dong||sameDong(p.umd,dong)));
  if(byLot.length===1)return {place:byLot[0],via:'lot'};
  if(byLot.length>1&&name){const n=byLot.filter(p=>normalizeName(p.name)===normalizeName(name));if(n.length===1)return {place:n[0],via:'lot+name'};}
 }
 if(name){
  const byName=inLawd.filter(p=>normalizeName(p.name)===normalizeName(name)&&(!dong||sameDong(p.umd,dong)));
  if(byName.length===1)return {place:byName[0],via:'name'};
 }
 return null;
}

// Market price from one building's valid sales (already filtered to the area type).
//   high   : >=3 sales in the last 6 months
//   medium : >=3 sales in the last 12 months
//   low    : 1-2 sales in the last 12 months, or a neighbouring area type
export function marketPrice(sales,{since6,since12,neighbour=false}){
 const in6=sales.filter(s=>s.deal_date>=since6),in12=sales.filter(s=>s.deal_date>=since12);
 const base=in6.length>=3?{rows:in6,window:6}:in12.length?{rows:in12,window:12}:null;
 if(!base)return null;
 const confidence=neighbour?'low':base.window===6?'high':in12.length>=3?'medium':'low';
 return {priceManwon:median(base.rows.map(s=>s.amount)),window:base.window,count:base.rows.length,confidence};
}

// The court category 상가,오피스텔,근린시설 also holds shops inside officetel buildings. A unit on
// the ground floor or below is treated as a shop and not compared with officetel sales.
export function shopFloor(usage,address){
 if(!/상가|근린/.test(String(usage??'')))return false;
 const m=String(address??'').match(/(지하\s*\d*\s*층|(?:제\s*)?(\d+)\s*층)/);
 return !!m&&(m[1].startsWith('지하')||Number(m[2])<=1);
}

// A minimum bid far above the building's sales usually means the wrong unit type was compared.
export const outlier=discount=>discount!=null&&discount<-30;
// A market price outside 0.3–3× the court/Onbid appraisal is almost always a matching error
// (wrong building, wrong area, a unit priced as a whole building). Every section drops it.
export const offAppraisal=(marketWon,appraisal)=>appraisal>0&&marketWon>0&&(marketWon>appraisal*3||marketWon<appraisal*0.3);

// Recommendation score (0-100) so "cheap and clean" ranks above "very cheap but troubled".
//   discount  : up to 60 points, capped at a 50% discount (deeper cuts usually mean problems)
//   confidence: high +20, medium +10, low 0
//   penalties : rights warnings, repeated failed bids (5+ −20, 8+ −35), a discount over 60% (−10)
// Grade: S >= 80, A >= 65, B >= 50, C >= 35, D below.
export const RISK_PENALTY={지분매각:30,유치권:20,선순위:20,법정지상권:20,위반건축물:10,대지권미등기:10,토지별도등기:10};
export function dealScore({discount,confidence,riskFlags=[],failedBids=0}){
 if(discount==null)return null;
 const discountPoints=Math.round(Math.max(0,Math.min(discount,50))/50*60);
 const confidencePoints={high:20,medium:10,low:0}[confidence]??0;
 const riskPoints=(riskFlags??[]).reduce((s,f)=>s+(RISK_PENALTY[f]??10),0);
 const failedPoints=failedBids>=8?35:failedBids>=5?20:0;
 const deepPoints=discount>60?10:0;   // a cut this deep is itself a sign of a hidden problem
 const score=Math.max(0,Math.min(100,20+discountPoints+confidencePoints-riskPoints-failedPoints-deepPoints));
 const grade=score>=80?'S':score>=65?'A':score>=50?'B':score>=35?'C':'D';
 return {score,grade,breakdown:{base:20,discountPoints,confidencePoints,riskPoints:-riskPoints,failedPoints:-failedPoints,deepPoints:-deepPoints}};
}

// 빌라 (연립·다세대) use the building methodology: villas rarely repeat a sale in the same building
// and size, so price per ㎡ is compared and scaled to the unit's area.
//   building : same lot, area within ±3㎡, last 12 months (3+ → medium, 1-2 → low)
//   dong-land: same 법정동, build year ±5 (when known), area ±30%, and land share per ㎡ of floor
//              (대지권 면적 ÷ 전용면적) within ±25% of the unit's — 8+ → medium, 5-7 → low
//   dong     : the same without the land-share filter when the unit's land share is unknown
//              or too few matches remain, 5+ → low
export const VILLA_USES=/^(다세대|다세대주택|연립주택|연립주택,다세대,빌라|빌라)$/;
export function villaPrice({area,landArea=null,building=[],dong=[],buildYear=null,since12}){
 const perM2=list=>median(list.map(s=>s.amount/s.area));
 const recent=list=>list.filter(s=>s.deal_date>=since12&&s.area>0);
 const same=recent(building).filter(s=>Math.abs(s.area-area)<=3);
 if(same.length)return {priceManwon:Math.round(perM2(same)*area),window:12,count:same.length,confidence:same.length>=3?'medium':'low',basis:'building'};
 const near=recent(dong).filter(s=>Math.abs(s.area-area)<=area*0.3&&(buildYear==null||s.build_year==null||Math.abs(s.build_year-buildYear)<=5));
 if(landArea>0){
  const ratio=landArea/area;
  const similar=near.filter(s=>s.land_area>0&&Math.abs(s.land_area/s.area-ratio)<=ratio*0.25);
  if(similar.length>=5)return {priceManwon:Math.round(perM2(similar)*area),window:12,count:similar.length,confidence:similar.length>=8?'medium':'low',basis:'dong-land'};
 }
 if(near.length>=5)return {priceManwon:Math.round(perM2(near)*area),window:12,count:near.length,confidence:'low',basis:'dong'};
 return null;
}
