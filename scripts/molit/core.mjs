// MOLIT 실거래 (아파트·오피스텔 매매·전월세) → local warehouse rows. Pure functions only.
import {createHash} from 'node:crypto';
import {XMLParser} from 'fast-xml-parser';

export const APIS={
 aptSale:{kind:'apt',deal:'sale',url:'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade'},
 aptRent:{kind:'apt',deal:'rent',url:'https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent'},
 offiSale:{kind:'offi',deal:'sale',url:'https://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade'},
 offiRent:{kind:'offi',deal:'rent',url:'https://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent'},
 // 연립·다세대 (빌라, 1.5단계). Sales carry landAr (대지권 면적) for the land-share comparison.
 rhSale:{kind:'rh',deal:'sale',url:'https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade'},
 rhRent:{kind:'rh',deal:'rent',url:'https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent'},
 // 상가·건물·토지 section (2단계). Land and 단독 lots are partly masked by MOLIT ("3**"), so they
 // are compared by 법정동, 용도지역 and size rather than by building.
 nrgSale:{kind:'nrg',deal:'sale',url:'https://apis.data.go.kr/1613000/RTMSDataSvcNrgTrade/getRTMSDataSvcNrgTrade'},
 landSale:{kind:'land',deal:'sale',url:'https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade'},
 shSale:{kind:'sh',deal:'sale',url:'https://apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade'},
 shRent:{kind:'sh',deal:'rent',url:'https://apis.data.go.kr/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent'},
};

// Leaf 시군구 codes for the capital area: a city whose 구 are listed separately is not
// queried itself (MOLIT files trades under the 구 code).
export function leafRegions(codes){
 const names=Object.keys(codes).filter(n=>/^(서울특별시|경기도|인천광역시) /.test(n));
 return names.filter(n=>!names.some(o=>o.startsWith(`${n} `))).map(n=>({name:n,code:codes[n]})).filter(r=>/^\d{5}$/.test(r.code));
}

// YYYYMM list, newest first, `count` months ending at the month of `now` (KST).
export function monthsBack(now,count){
 const [y,m]=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(now).split('-').map(Number);
 return Array.from({length:count},(_,i)=>{const d=new Date(Date.UTC(y,m-1-i,1));return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}`;});
}

const parser=new XMLParser({parseTagValue:false,processEntities:false});
// Returns {total, rows}; throws API_<code> for any provider or gateway error envelope.
export function decode(xml){
 const parsed=parser.parse(xml);
 const gateway=parsed.OpenAPI_ServiceResponse?.cmmMsgHeader;
 if(gateway)throw Error(`API_${gateway.returnReasonCode??'GATEWAY'}`);
 const r=parsed.response;
 const code=String(r?.header?.resultCode??'INVALID_RESPONSE');
 if(!['000','00'].includes(code))throw Error(`API_${code}`);
 const total=Number(r.body?.totalCount);
 if(!Number.isSafeInteger(total)||total<0)throw Error('API_INVALID_TOTAL');
 const items=r.body?.items?.item;
 return {total,rows:Array.isArray(items)?items:items?[items]:[]};
}

const text=v=>v==null||String(v).trim()===''?null:String(v).trim();
const manwon=v=>{const s=text(v);if(s==null)return null;const n=Number(s.replace(/,/g,''));return Number.isSafeInteger(n)?n:null;};
const int=v=>{const s=text(v);if(s==null)return null;const n=Number(s);return Number.isFinite(n)?Math.trunc(n):null;};
const real=v=>{const s=text(v);if(s==null)return null;const n=Number(s);return Number.isFinite(n)?n:null;};
const ymd=(y,m,d)=>{const [Y,M,D]=[int(y),int(m),int(d)];return Y&&M&&D?`${Y}-${String(M).padStart(2,'0')}-${String(D).padStart(2,'0')}`:null;};
// 해제일 comes as "26.09.30" (yy.mm.dd).
export function cancelDate(v){const s=text(v);const m=s?.match(/^(\d{2})\.(\d{2})\.(\d{2})$/);return m?`20${m[1]}-${m[2]}-${m[3]}`:null;}

// One warehouse row per API item. The key hashes the full item so an identical re-filing is
// one row, while a correction (any changed field) becomes a new row after the month reload.
export function toRow(apiName,lawd,ym,item){
 const api=APIS[apiName];if(!api)throw Error('UNKNOWN_API');
 return {
  key:createHash('sha256').update(apiName+JSON.stringify(Object.entries(item).sort(([a],[b])=>a.localeCompare(b)))).digest('hex'),
  api:apiName,kind:api.kind,deal:api.deal,lawd,ym,
  name:text(item.aptNm)??text(item.offiNm)??text(item.mhouseNm),umd:text(item.umdNm),jibun:text(item.jibun),
  apt_seq:text(item.aptSeq),building:text(item.aptDong),
  area:real(item.excluUseAr)??real(item.buildingAr)??real(item.totalFloorAr)??real(item.dealArea),floor:int(item.floor),build_year:int(item.buildYear),
  deal_date:ymd(item.dealYear,item.dealMonth,item.dealDay),
  amount:manwon(item.dealAmount),deposit:manwon(item.deposit),monthly_rent:manwon(item.monthlyRent),
  dealing:text(item.dealingGbn),cancel_date:cancelDate(item.cdealDay),contract_type:text(item.contractType),
  land_area:real(item.landAr)??real(item.plottageAr)??real(item.dealArea),house_type:text(item.houseType),
  building_area:real(item.buildingAr),total_floor_area:real(item.totalFloorAr),
  use_type:text(item.buildingUse)??text(item.jimok),building_type:text(item.buildingType),
  zone:text(item.landUse),share:text(item.shareDealingType),
  raw:JSON.stringify(item),
 };
}
