import { parseDetail } from './core.mjs';
import { inSeoulGyeonggi } from './scope.mjs';

export function caseTargets(state, audit, courts) {
 const allowed=new Set(courts);
 const keys=new Set([...(audit.absentFromPass??[]),...(audit.missingDetails??[])].map(x=>x.key));
 return [...keys].map(k=>state.items[k]).filter(x=>x&&allowed.has(x.court)&&x.assetCategory==='real-estate'&&inSeoulGyeonggi(x));
}
export function caseEvidence(item,{queryRaw,basicRaw,propertyRaw='',sourceUrl,observedAt,detailAvailable=false}) {
 if(new URL(sourceUrl).origin!=='https://www.courtauction.go.kr'||!Number.isFinite(Date.parse(observedAt)))throw Error('Invalid case provenance');
 if(!queryRaw.includes(item.court)||queryRaw.replace(/\s/g,'').match(/\d{4}타경\d+/)?.[0]!==item.caseNumber||basicRaw.match(/사건번호\s*(\d{4}타경\d+)/)?.[1]!==item.caseNumber)throw Error('Case search identity mismatch');
 if(propertyRaw&&Number(propertyRaw.match(/물건번호\s*(\d+)/)?.[1])!==item.itemNumber)throw Error('Case property identity mismatch');
 return {court:item.court,caseNumber:item.caseNumber,itemNumber:item.itemNumber,sourceUrl,observedAt,
  caseOutcome:basicRaw.match(/(?:^|\n)[ \t]*종국결과[ \t]*\n?[ \t]*([^\n\t]+)/)?.[1]?.trim()??null,
  propertyFound:!!propertyRaw,detailAvailable,propertyRaw,
  latestResult:propertyRaw.match(/(?:^|\n)[ \t]*최근입찰결과[ \t]*\n?[ \t]*([^\n\t]+)/)?.[1]?.trim()??null,
  // A case-level outcome and absence never imply an individual property's closure.
  verification:'official-case-search',itemClosureConfirmed:false};
}
export function applyCaseEvidence(state,key,evidence,detailRaw=null) {
 const item=state.items[key];
 if(!item||evidence.court!==item.court||evidence.caseNumber!==item.caseNumber||evidence.itemNumber!==item.itemNumber)throw Error('Case evidence identity mismatch');
 const next=structuredClone(state);
 next.items[key].caseSearchEvidence=evidence;
 if(detailRaw){
  if(detailRaw.match(/사건번호\s*(\d{4}타경\d+)/)?.[1]!==item.caseNumber)throw Error('Detail case mismatch');
  next.items[key].detail=parseDetail(detailRaw,{...item,observedAt:evidence.observedAt});
  delete next.detailQueue?.[key];
 }
 // Preserve list observation, price, date, assets, and lifecycle status.
 return next;
}
