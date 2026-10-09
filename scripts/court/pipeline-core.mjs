// Conservative first rule: exact complex/address identity and <=0.1m², no estimated valuation.
import {regionCode} from './regions.mjs';
export function mapCourtProperty(item) {
  if (item.assetCategory !== 'real-estate' || item.validationIssues.length) return null;
  const address = item.assets.map(a => a.address).join(' / ');
  const region = item.assets[0]?.address.split(/\s+/) ?? [];
  const legalDong = item.assets[0]?.address.match(/\(([가-힣][가-힣0-9]*(?:동|가))[,)]/)?.[1]
    ?? region.find(s=>/^[가-힣][가-힣0-9]*(?:동|가)$/.test(s)) ?? null;
  const nullable = ['notice_id','latitude','longitude','land_area','building_area','pnu','status_code','disposal_code','bid_start_at','auction_round'];
  return { ...Object.fromEntries(nullable.map(k => [k,null])), source:'court', source_property_id:`${item.court}:${item.caseNumber}`,
    auction_condition_id:String(item.itemNumber), title:`${item.court} ${item.caseNumber} · 물건 ${item.itemNumber}`,
    property_type:item.use,usage_type:item.use,asset_type:'부동산',address,sido:region[0]??null,sigungu:region[1]??null,
    dong:legalDong, appraisal_price:String(item.appraisalWon), minimum_bid_price:String(item.minimumBidWon),
    failed_bid_count:item.status.match(/유찰\s*(\d+)회/) ? Number(item.status.match(/유찰\s*(\d+)회/)[1]) : item.status==='신건'?0:null,
    auction_sequence:null, bid_end_at:null,
    status:item.status,disposal_method:'법원경매',bulk_bid:item.assets.length>1,exclusive_area:item.detail?.exclusiveAreaM2??null,
    source_updated_at:null };
}
export function apartmentTarget(item) {
  if (item.use !== '아파트' || !item.detail?.exclusiveAreaM2) return null;
  if (comparisonExclusion(item)) return null;
  const address = item.assets[0]?.address ?? '';
  const parenthesized = address.match(/\(([^,()]+),([^()]+)\)/);
  // Some court rows use a full lot address instead of '(legal dong, complex)'.
  const lotAddress = address.match(/^(.+?)\s+((?:[^\s]+[읍면]\s+)?[^\s]+[동가리])\s+(\d+(?:-\d+)?)\s+(.+?)\s+(?:(?:제\s*)?\d+동\s+)?(?:제\s*)?\d+층/);
  const raw = item.detail.raw;
  const firstJibun = raw.match(/1동의 건물의 표시\s+([^\n]+?)\s+((?:[^\s]+[읍면]\s+)?[^\s]+[동가리])\s+(\d+(?:-\d+)?)/);
  const region = firstJibun?.[1]?.trim().replace(/\s+/g,' ');
  const code=regionCode(region);
  const legalDong=parenthesized?.[1]?.trim()??lotAddress?.[2];
  const complex=parenthesized?.[2]?.trim()??lotAddress?.[4]?.trim();
  if (!complex || !firstJibun || !code || !address.startsWith(`${region} `) || firstJibun[2] !== legalDong) return null;
  if(!parenthesized&&(lotAddress[1]!==region||lotAddress[3]!==firstJibun[3]||!raw.replace(/\s/g,'').includes(complex.replace(/\s/g,''))))return null;
  const floor = address.match(/\s(?:제\s*)?(\d+)층/);
  if (!floor) return null;
  return {complex:complex.replace(/아파트$/,''),umdNm:legalDong,jibun:firstJibun[3],
    regionCode:code,area:item.detail.exclusiveAreaM2,floor:Number(floor[1]),minimumBidWon:item.minimumBidWon,
    identityMethod:'법원 상세의 지번·법정동과 목록의 단지명 일치',areaTolerance:0.1};
}
export function comparisonExclusion(item) {
  if (item.assets?.length > 1) return '여러 부동산을 묶어 매각하는 물건이므로 단일 주택 실거래와 직접 비교하지 않습니다.';
  const text = `${item.detail?.raw ?? ''}\n${item.note ?? ''}`;
  if (/지분\s*매각|매각\s*지분\s*[:：]|\d+\s*분(?:의)?\s*\d+[^\n]*지분/.test(text))
    return '지분 매각 물건입니다. 주택 전체의 실거래가와 최저입찰가를 직접 비교하지 않습니다.';
  return null;
}
export function recentMonths(now, count=6) {
  return Array.from({length:count},(_,i)=>{ const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}`; });
}
