// K-APT (공동주택 단지 목록·기본정보) → public.complexes rows. Pure functions only.
export const LIST_ENDPOINT='https://apis.data.go.kr/1613000/AptListService4/getSidoAptList4';
export const BASIS_ENDPOINT='https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusBassInfoV5';
export const DETAIL_ENDPOINT='https://apis.data.go.kr/1613000/AptBasisInfoServiceV5/getAphusDtlInfoV5';
export const SIDO={'11':'서울특별시','41':'경기도','28':'인천광역시'};
export const LIST_PAGE_SIZE=1000;

// The gateway answers JSON on success but a gateway envelope (XML or JSON
// OpenAPI_ServiceResponse) on key, quota and rate errors, e.g. API_23 = per-second limit.
export function decode(raw){
 const t=raw.trimStart();
 if(t.startsWith('<')){
  const reason=t.match(/<returnReasonCode>(\d+)</)?.[1]??t.match(/<resultCode>(\d+)</)?.[1];
  throw Error(`API_${reason??'XML'}`);
 }
 const json=JSON.parse(t);
 const gateway=json.OpenAPI_ServiceResponse?.cmmMsgHeader;
 if(gateway)throw Error(`API_${gateway.returnReasonCode??'GATEWAY'}`);
 const r=json.response;
 const code=String(r?.header?.resultCode??'INVALID_RESPONSE');
 if(code!=='00')throw Error(`API_${code}`);
 return r.body;
}
export const listItems=body=>{const v=body?.items;return Array.isArray(v)?v:v?.item?[].concat(v.item):[];};

const text=v=>v==null||String(v).trim()===''?null:String(v).trim();
const int=v=>{const s=text(v);if(s==null)return null;const n=Number(s.replace(/,/g,''));return Number.isFinite(n)?Math.round(n):null;};
const num=v=>{const s=text(v);if(s==null)return null;const n=Number(s.replace(/,/g,''));return Number.isFinite(n)?n:null;};
export function date8(v){
 const s=text(v);if(!s||!/^\d{8}$/.test(s))return null;
 const [y,m,d]=[s.slice(0,4),s.slice(4,6),s.slice(6,8)].map(Number);
 const t=new Date(Date.UTC(y,m-1,d));
 return t.getUTCFullYear()===y&&t.getUTCMonth()===m-1&&t.getUTCDate()===d?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:null;
}

// PNU = 법정동코드(10) + 대지구분(1 일반, 2 산) + 본번(4) + 부번(4).
// kaptAddr looks like "서울특별시 송파구 잠실동 187-10 잠실 센트럴파크"; the lot number is the
// first token after the 동/리 that is digits(-digits). Multi-lot addresses ("123외") use the first lot.
export function jibunPnu(bjdCode,kaptAddr){
 if(!/^\d{10}$/.test(bjdCode??'')||!kaptAddr)return null;
 // K-APT also writes a lot with an empty sub-number as "60-".
 const m=String(kaptAddr).match(/[동리가로]\s+(산\s*)?(\d{1,4})(?:-(\d{1,4})?)?(?=\s|외|,|$)/);
 if(!m)return null;
 return bjdCode+(m[1]?'2':'1')+m[2].padStart(4,'0')+(m[3]??'0').padStart(4,'0');
}

export function fromList(item,sidoCode,seenAt){
 const kapt=text(item.kaptCode);
 if(!kapt||!SIDO[sidoCode])throw Error('INVALID_LIST_ITEM');
 return {kapt_code:kapt,name:text(item.kaptName)??kapt,sido:text(item.as1)??SIDO[sidoCode],sigungu:text(item.as2),dong:[text(item.as3),text(item.as4)].filter(Boolean).join(' ')||null,bjd_code:/^\d{10}$/.test(item.bjdCode??'')?item.bjdCode:null,list_seen_at:seenAt};
}

export function fromBasis(b,fetchedAt){
 const bjd=/^\d{10}$/.test(b.bjdCode??'')?b.bjdCode:null;
 return {
  name:text(b.kaptName),complex_kind:text(b.codeAptNm),bjd_code:bjd,pnu:jibunPnu(bjd,b.kaptAddr),
  jibun_address:text(b.kaptAddr),road_address:text(b.doroJuso),
  // Some complexes report 0 households but a real 호 count; 0 is never a valid complex size.
  households:int(b.kaptdaCnt)||int(b.hoCnt)||null,dong_count:int(b.kaptDongCnt),ho_count:int(b.hoCnt),approved_on:date8(b.kaptUsedate),
  sale_type:text(b.codeSaleNm),heating:text(b.codeHeatNm),hall_type:text(b.codeHallNm),management_type:text(b.codeMgrNm),
  builder:text(b.kaptBcompany),developer:text(b.kaptAcompany),
  total_floor_area:num(b.kaptTarea),management_area:num(b.kaptMarea),private_area:num(b.privArea),
  units_le60:int(b.kaptMparea60),units_le85:int(b.kaptMparea85),units_le135:int(b.kaptMparea135),units_gt135:int(b.kaptMparea136),
  basis_raw:b,basis_fetched_at:fetchedAt,
 };
}

export function fromDetail(d,fetchedAt){
 return {
  structure:text(d.codeStr),parking_ground:int(d.kaptdPcnt),parking_underground:int(d.kaptdPcntu),elevators:int(d.kaptdEcnt),
  ev_chargers_ground:int(d.groundElChargerCnt),ev_chargers_underground:int(d.undergroundElChargerCnt),
  subway_line:text(d.subwayLine),subway_station:text(d.subwayStation),subway_walk:text(d.kaptdWtimesub),bus_walk:text(d.kaptdWtimebus),
  detail_raw:d,detail_fetched_at:fetchedAt,
 };
}
