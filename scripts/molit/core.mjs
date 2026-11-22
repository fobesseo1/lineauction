// MOLIT 실거래 (아파트·오피스텔 매매·전월세) → local warehouse rows. Pure functions only.
import {createHash} from 'node:crypto';
import {XMLParser} from 'fast-xml-parser';
import {SIDO_NAMES,inSidoList} from '../regions.mjs';

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
 // 아파트 분양권·입주권 전매 (new complexes before their first 매매); only the last 12 months.
 silvSale:{kind:'silv',deal:'sale',months:12,url:'https://apis.data.go.kr/1613000/RTMSDataSvcSilvTrade/getRTMSDataSvcSilvTrade'},
};

// Leaf 시군구 codes of the enabled regions (scripts/regions.json): a city whose 구 are listed separately
// is not queried itself (MOLIT files trades under the 구 code). 세종 has no 시군구: its key is the 시도 name.
export function leafRegions(codes,sidoNames=SIDO_NAMES){
 const names=Object.keys(codes).filter(n=>inSidoList(n,sidoNames));
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
  zone:text(item.landUse),share:text(item.shareDealingType),ownership:text(item.ownershipGbn),
  raw:JSON.stringify(item),
 };
}

// MOLIT sometimes keeps a sale reported twice: an earlier filing with no 동 and no 등기일 next to a later
// one with both, every other field the same (checked 2026-11-22 on rt.molit.go.kr: 6 of 6 pairs were two
// 신고번호, the empty one the earlier filing, still unregistered 4–16 months on; ~820 pairs since 2023-06).
// `group` = warehouse rows ({key, raw}) of one month with the same lot, date, area, floor and price.
// Returns the keys of the empty filings that a filled one stands for (each filled filing covers one).
const blank=v=>v==null||typeof v==='object'||String(v).trim()==='';
const LATE_FIELDS=['aptDong','rgstDate'];
export function staleFilingKeys(group){
 const items=group.map(r=>({key:r.key,item:JSON.parse(r.raw)}));
 const rest=it=>JSON.stringify(Object.keys(it).filter(k=>!LATE_FIELDS.includes(k)&&!blank(it[k])).sort().map(k=>[k,String(it[k]).trim()]));
 const filled=new Map();
 for(const x of items)if(LATE_FIELDS.every(k=>!blank(x.item[k]))){const s=rest(x.item);filled.set(s,(filled.get(s)??0)+1);}
 const out=[];
 for(const x of items){
  if(!LATE_FIELDS.every(k=>blank(x.item[k])))continue;
  const s=rest(x.item),n=filled.get(s)??0;
  if(n>0){out.push(x.key);filled.set(s,n-1);}
 }
 return out;
}

// 연립·다세대 (rh) filings are kept only on the lot of a K-APT complex (apartments only, 2026-11-18):
// K-APT lists 연립주택 complexes (광주 소촌라인1차 904세대, 부산 대건아파트) whose trades MOLIT files as rh.
// A lot is "lawd|umd|jibun" in MOLIT's spelling: lawd = 법정동 code's first 5 digits, umd = K-APT dong
// ("다대동", "부발읍 죽당리"), jibun = the number after it in the K-APT 지번 주소.
export const lotKey=(lawd,umd,jibun)=>`${lawd}|${String(umd??'').trim()}|${String(jibun??'').trim()}`;
export function kaptLots(complexes){
 const out=new Set();
 for(const c of complexes){
  if(!/^\d{10}$/.test(c.bjd_code??'')||!c.dong||!c.jibun_address)continue;
  const words=c.jibun_address.trim().split(/\s+/),last=c.dong.trim().split(/\s+/).at(-1);
  const at=words.lastIndexOf(last),jibun=at>=0?words[at+1]:null;
  if(jibun&&/^(산)?\d+(-\d+)?$/.test(jibun))out.add(lotKey(c.bjd_code.slice(0,5),c.dong,jibun));
 }
 return out;
}

// The fields of a filing that name the trade itself. MOLIT fills some fields in later (aptDong 동,
// rgstDate 등기일, cdealDay 해제일, 중개사 소재지), which changes the full-item hash; on 2026-11-22 the
// September aptDong backfill gave ~2,000 published trades a second row under a new key.
export const stableOf=r=>JSON.stringify([r.api,r.umd??null,r.jibun??null,r.name??null,r.area??null,r.floor??null,r.deal_date??null,r.amount??null,r.deposit??null,r.monthly_rent??null]);

// Keys for one reloaded month. `rows` are toRow() results (key = full-item hash, no suffix), in API
// order; `old` are the month's warehouse rows before the reload ({key, ...columns}). A filing keeps
// its earlier key when the full item is unchanged (exact key), or else when an earlier row with the
// same stable fields is still unclaimed (a later-filled field). Only a new trade gets a new key, so
// the site row of a corrected filing is updated in place instead of duplicated.
export function assignKeys(rows,old=[]){
 const seen=new Map();
 const fresh=rows.map(r=>{const n=(seen.get(r.key)??0)+1;seen.set(r.key,n);return {...r,key:`${r.key}#${n}`};});
 const oldKeys=new Set(old.map(o=>o.key)),used=new Set(),out=new Array(fresh.length);
 fresh.forEach((r,i)=>{if(oldKeys.has(r.key)){out[i]=r;used.add(r.key);}});
 const byStable=new Map();
 for(const o of old){if(used.has(o.key))continue;const s=stableOf(o);(byStable.get(s)??byStable.set(s,[]).get(s)).push(o.key);}
 fresh.forEach((r,i)=>{
  if(out[i])return;
  const k=byStable.get(stableOf(r))?.shift();
  if(k){out[i]={...r,key:k};used.add(k);}
 });
 fresh.forEach((r,i)=>{
  if(out[i])return;
  let key=r.key;
  if(used.has(key)){const [h,n]=key.split('#');let m=Number(n);do key=`${h}#${++m}`;while(used.has(key)||oldKeys.has(key));}
  out[i]={...r,key};used.add(key);
 });
 return out;
}
