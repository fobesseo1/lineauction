// 상가·건물·토지 section pricing (2단계). MOLIT masks land, 단독 and whole-building lots ("3**"),
// so those are compared within the 법정동 (or 시군구) by price per ㎡ of land; shop units (집합)
// keep their lot and are compared in the same building first. Confidence never goes above medium.
import {median} from './summary.mjs';
import {sameDong} from './match.mjs';

const LAND=/^(전답|전|답|대지|대지,임야,전답|임야|잡종지|공장용지|창고용지|목장용지|과수원|기타토지|토지|주차장|체육용지|학교용지|주유소용지|철도용지|종교용지|주택부지)$/;
const HOUSE=/^(단독주택|단독주택다가구|다가구주택|다중주택)$/;
const SHOP=/^(근린시설|상가|상가,오피스텔,근린시설|근린생활시설|기타근린생활시설|판매시설|업무시설|숙박시설|사무실|기타상가용및업무용|구매시설|백화점|시장|상업용빌딩|주\/상용건물|상가주택)$/;

// Which comparison applies: land, house (단독·다가구), unit (a 호 in a 집합 building) or building.
export function commercialKind(usage,text=''){
 const u=String(usage??'').trim();
 if(LAND.test(u))return 'land';
 if(HOUSE.test(u))return 'house';
 if(SHOP.test(u))return u==='상업용빌딩'?'building':/\d+\s*호/.test(text)?'unit':'building';
 return null;
}

// "제2종일반주거지역" and MOLIT's "제2종일반주거" are the same zone.
export const normalizeZone=z=>z?String(z).replace(/\s/g,'').replace(/지역$/,''):null;

// Land category groups, so 전 and 답 compare with each other but not with 대.
export function jimokGroup(v){
 const s=String(v??'');
 if(/^대/.test(s)||s==='대지'||s==='주택부지')return '대';
 if(/^(전|답|과수원|전답)/.test(s))return '농지';
 if(/임야/.test(s))return '임야';
 if(/공장|창고/.test(s))return '공장';
 if(/잡종지|주차장/.test(s))return '잡종지';
 return s||null;
}

// 1층 / 상층 / 지하 from a unit address.
export function floorClass(text){
 const t=String(text??'');
 if(/지하\s*\d*\s*층|지\s*\d+\s*층|B\d+\s*호/.test(t))return 'B';
 const m=[...t.matchAll(/(?:제\s*)?(\d+)\s*층/g)].at(-1);
 if(!m)return null;
 return Number(m[1])<=1?'1':'U';
}

const useGroup=u=>{const s=String(u??'');return /근린/.test(s)?'근린':/판매/.test(s)?'판매':/업무|사무/.test(s)?'업무':/숙박/.test(s)?'숙박':'기타';};
const valid=t=>!t.cancel_date&&t.dealing!=='직거래'&&t.amount>0&&t.share!=='지분';
const priceOf=(list,areaOf,subjectArea)=>Math.round(median(list.map(t=>t.amount/areaOf(t)))*subjectArea);
const conf=(n,mediumAt)=>n>=mediumAt?'medium':'low';

// Each returns {priceManwon, count, confidence, basis} or null. `dong` / `lawd` are the subject's
// 법정동 sales and its whole 시군구 sales of the matching MOLIT dataset, already date-filtered.
// A land ㎡ price far from the parcel's own 개별공시지가 means the comparables are a different kind
// of land (e.g. forest next to development plots). Market prices sit around 0.5–4× 공시지가.
export function plausibleLand(priceManwon,area,officialPerM2){
 if(!(officialPerM2>0))return true;
 const ratio=priceManwon*10000/area/officialPerM2;
 return ratio>=0.5&&ratio<=4;
}

export function landPrice({area,zone,jimok,dong=[],lawd=[],officialPerM2=null}){
 if(!(area>0))return null;
 const z=normalizeZone(zone),g=jimokGroup(jimok);
 const fit=t=>valid(t)&&t.land_area>0&&t.land_area>=area*0.3&&t.land_area<=area*3&&(!z||normalizeZone(t.zone)===z)&&(!g||jimokGroup(t.use_type)===g);
 const near=dong.filter(fit);
 const ok=r=>plausibleLand(r.priceManwon,area,officialPerM2)?r:null;
 if(near.length>=5)return ok({priceManwon:priceOf(near,t=>t.land_area,area),count:near.length,confidence:conf(near.length,10),basis:'land-dong'});
 // Without a known zone the 시군구 mixes too many kinds of land.
 const wide=z?lawd.filter(fit):[];
 if(wide.length>=8)return ok({priceManwon:priceOf(wide,t=>t.land_area,area),count:wide.length,confidence:'low',basis:'land-sigungu'});
 return null;
}

export function housePrice({landArea,buildYear=null,dong=[],lawd=[]}){
 if(!(landArea>0))return null;
 const fit=t=>valid(t)&&t.land_area>0&&t.land_area>=landArea*0.6&&t.land_area<=landArea*1.6&&(buildYear==null||t.build_year==null||Math.abs(t.build_year-buildYear)<=10);
 const near=dong.filter(fit);
 if(near.length>=5)return {priceManwon:priceOf(near,t=>t.land_area,landArea),count:near.length,confidence:conf(near.length,8),basis:'house-dong'};
 const wide=lawd.filter(fit);
 if(wide.length>=8)return {priceManwon:priceOf(wide,t=>t.land_area,landArea),count:wide.length,confidence:'low',basis:'house-sigungu'};
 return null;
}

// Shop units: same lot first (any use, same floor class), else the same 법정동 with the same
// floor class and use group. Unit area is MOLIT's buildingAr for 집합 sales.
export function unitPrice({area,floor,use,building=[],dong=[]}){
 if(!(area>0))return null;
 const unit=t=>valid(t)&&t.building_type==='집합'&&t.area>0&&(!floor||floorClass(`${t.floor}층`)===floor||t.floor==null);
 const same=building.filter(unit);
 if(same.length)return {priceManwon:priceOf(same,t=>t.area,area),count:same.length,confidence:conf(same.length,3),basis:'unit-building'};
 const near=dong.filter(t=>unit(t)&&useGroup(t.use_type)===useGroup(use)&&t.area>=area*0.4&&t.area<=area*2.5);
 if(near.length>=5)return {priceManwon:priceOf(near,t=>t.area,area),count:near.length,confidence:'low',basis:'unit-dong'};
 return null;
}

// Whole buildings: price per ㎡ of land of whole-building (일반) sales in the same zone.
export function buildingPrice({plotArea,zone,dong=[],lawd=[]}){
 if(!(plotArea>0))return null;
 const z=normalizeZone(zone);
 const fit=t=>valid(t)&&t.building_type==='일반'&&t.land_area>0&&t.land_area>=plotArea*0.3&&t.land_area<=plotArea*3&&(!z||normalizeZone(t.zone)===z);
 const near=dong.filter(fit);
 if(near.length>=5)return {priceManwon:priceOf(near,t=>t.land_area,plotArea),count:near.length,confidence:conf(near.length,10),basis:'building-dong'};
 const wide=lawd.filter(fit);
 if(wide.length>=8)return {priceManwon:priceOf(wide,t=>t.land_area,plotArea),count:wide.length,confidence:'low',basis:'building-sigungu'};
 return null;
}

export {sameDong};

// Income view for 단독·다가구 in a 법정동: rents are per rented room/unit, sales are whole houses.
//   rentPerM2Year : median (월세×12 + 보증금×전환율) ÷ 임대면적, 만원/㎡/년 (전환율 5%)
//   salePerM2     : median 매매가 ÷ 연면적, 만원/㎡
//   grossYield    : rentPerM2Year ÷ salePerM2 × 100 (%), before vacancy, costs and tax
//   floorPrice    : salePerM2 × the house's 연면적, a cross-check on the land-based price
export const DEPOSIT_RATE=0.05;
export function houseIncome({rents=[],sales=[],floorArea=null}){
 const r=rents.filter(t=>t.area>0&&(t.monthly_rent>0||t.deposit>0)).map(t=>((t.monthly_rent??0)*12+(t.deposit??0)*DEPOSIT_RATE)/t.area);
 const s=sales.filter(t=>valid(t)&&t.total_floor_area>0).map(t=>t.amount/t.total_floor_area);
 if(r.length<5||s.length<5)return null;
 const rentPerM2Year=median(r),salePerM2=median(s);
 return {rentPerM2Year:Math.round(rentPerM2Year*10)/10,salePerM2:Math.round(salePerM2),grossYield:Math.round(rentPerM2Year/salePerM2*1000)/10,
  rents:r.length,sales:s.length,floorPrice:floorArea>0?Math.round(salePerM2*floorArea):null};
}
