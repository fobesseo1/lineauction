import {parse} from 'lossless-json';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
export const LIST_ENDPOINT='https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2';
export const DETAIL_ENDPOINT='https://apis.data.go.kr/B010003/OnbidRlstDtlSrvc2/getRlstDtlInf2';
export const PROPERTY_CODES='0007,0010,0005,0004,0002,0003,0006,0008,0011,0013';
export const scope=r=>['서울특별시','경기도'].includes(r.lctnSdnm)&&r.dspsMthodCd==='0001'&&(!r.cltrUsgLclsCtgrNm||r.cltrUsgLclsCtgrNm==='부동산');
export const identity=r=>`${r.cltrMngNo}:${r.pbctCdtnNo}`;
export function decode(raw){
 let data;
 if(raw.trimStart().startsWith('<')){
  if(/<!DOCTYPE|<!ENTITY/i.test(raw)||XMLValidator.validate(raw)!==true)throw Error('INVALID_XML');
  data=new XMLParser({parseTagValue:false,processEntities:false}).parse(raw);
 }else data=parse(raw,undefined,v=>v);
 const e=data?.response??data;
 const denied=e?.OpenAPI_ServiceResponse?.cmmMsgHeader;
 const code=String(e?.header?.resultCode??e?.result?.resultCode??denied?.returnReasonCode??'INVALID_RESPONSE');
 // The provider uses a different envelope for an empty search partition.
 if(code==='03'&&!rowsOf(e).length&&!Number(e?.body?.totalCount))return {header:{resultCode:'03',resultMsg:'NODATA_ERROR'},body:{totalCount:0,pageNo:1,numOfRows:100,items:{item:[]}},noData:true};
 if(!['00','0','0000'].includes(code))throw Error(`API_${code}`);
 return e;
}
export function rowsOf(e){const v=e.body?.items?.item;return Array.isArray(v)?v:v?[v]:[];}
export function partitionList(){return ['서울특별시','경기도'].flatMap(region=>['0001','0002'].flatMap(bid=>['N','Y'].map(privateContract=>({region,bid,privateContract}))));}
export function won(v){if(v==null||v==='')return null;const s=String(v).replace(/,/g,'').trim();return /^\d+$/.test(s)&&BigInt(s)<10n**30n?s:null;}
export function koreanDate(v){
 if(!v)return null;if(!/^\d{12}(\d{2})?$/.test(v))throw Error('INVALID_DATE');
 const [y,m,d,h,min,s]=[v.slice(0,4),v.slice(4,6),v.slice(6,8),v.slice(8,10),v.slice(10,12),v.slice(12,14)||'00'].map(Number);
 const t=new Date(Date.UTC(y,m-1,d,h,min,s));
 if(t.getUTCFullYear()!==y||t.getUTCMonth()!==m-1||t.getUTCDate()!==d||h>23||min>59||s>59)throw Error('INVALID_DATE');
 return new Date(t.getTime()-9*3600000).toISOString();
}
export function toProperty(r){
 if(!scope(r)||!r.cltrMngNo||!/^\d+$/.test(String(r.pbctCdtnNo)))throw Error('INVALID_SCOPE_OR_IDENTITY');
 const text=v=>v==null||String(v).trim()===''?null:String(v).trim();
 const area=v=>v==null||v===''?null:Number(v);
 return {source:'onbid',source_property_id:r.cltrMngNo,auction_condition_id:String(r.pbctCdtnNo),notice_id:text(r.onbidPbancNo),title:text(r.onbidCltrNm)||r.cltrMngNo,property_type:'real_estate',usage_type:text(r.cltrUsgSclsCtgrNm)||text(r.cltrUsgMclsCtgrNm),asset_type:text(r.prptDivNm),address:text(r.zadrNm)||text(r.cltrRadr),sido:r.lctnSdnm,sigungu:text(r.lctnSggnm),dong:text(r.lctnEmdNm),latitude:null,longitude:null,appraisal_price:won(r.apslEvlAmt),minimum_bid_price:won(r.lowstBidPrcIndctCont),failed_bid_count:r.usbdNft==null?null:Number(r.usbdNft),auction_round:text(r.pbctsn),auction_sequence:text(r.pbctNsq),bid_start_at:koreanDate(r.cltrBidBgngDt),bid_end_at:koreanDate(r.cltrBidEndDt),status:text(r.pbctStatNm),status_code:text(r.pbctStatCd),disposal_method:text(r.dspsMthodNm),disposal_code:r.dspsMthodCd,bulk_bid:r.batcBidYn==null?null:r.batcBidYn==='Y',land_area:area(r.landSqms),building_area:area(r.bldSqms),exclusive_area:null,pnu:text(r.ltnoPnu),source_updated_at:koreanDate(r.mdfcnDt)};
}
export function safeOfficialUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&['www.onbid.co.kr','onbid.co.kr','open.kamco.or.kr'].includes(u.hostname)&&!u.username&&!u.password?u.href:null;}catch{return null;}}
