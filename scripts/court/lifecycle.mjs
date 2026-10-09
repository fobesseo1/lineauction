import {detailSchedule} from './schedule.mjs';
// Only an explicit result for this exact item can close it. A bid/sale decision alone may change.
export function lifecycleFromItem(item) {
 const proof=item.resultEvidence;
 if(proof?.result==='매각' && proof.court===item.court && proof.caseNumber===item.caseNumber && proof.itemNumber===item.itemNumber
  && /^https:\/\/www\.courtauction\.go\.kr\//.test(proof.sourceUrl) && Number.isFinite(Date.parse(proof.observedAt))
  && proof.identityRow?.length===7 && proof.resultRow?.length===3 && proof.identityRow[1].includes(item.caseNumber)
  && Number(proof.identityRow[2])===item.itemNumber && proof.resultRow[2].trim().split(/\s+/)[0]==='매각'
  && proof.auctionDate && (!item.auctionDate || proof.auctionDate>=item.auctionDate)) {
   return {state:'closed',reason:'매각 확인 · 해당 입찰 종료(대금납부 미확인)',checked_at:proof.observedAt,source_url:proof.sourceUrl,evidence:proof};
 }
 if(item.observationStatus==='needs-recheck')return {state:'needs-recheck',reason:'완전한 목록 검색에서 미관측. 상세·결과 재확인 필요',checked_at:item.missingObservedAt??item.lastSeenAt,source_url:item.sourceUrl,evidence:{lastSeenAt:item.lastSeenAt}};
 const current=detailSchedule(item.detail?.raw).find(r=>r.date===item.auctionDate&&r.minimumBidWon===item.minimumBidWon);
 const explicit=current?.result?.match(/^(매각|취하|취소)(?:\s|\(|$)/)?.[1];
 const detailIdentity=String(item.detail?.raw??'').replace(/\s/g,'');
 if(explicit&&item.detail?.observedAt&&Number.isFinite(Date.parse(item.detail.observedAt))
  && /^https:\/\/www\.courtauction\.go\.kr\//.test(item.sourceUrl??'')
  && detailIdentity.includes(item.caseNumber)&&detailIdentity.includes(`물건번호${item.itemNumber}물건종류`)){
   return{state:'closed',reason:explicit==='매각'?'매각 확인 · 해당 입찰 종료(대금납부 미확인)':`${explicit} 확인 · 해당 입찰 종료`,checked_at:item.detail.observedAt,source_url:item.sourceUrl,evidence:{schedule:current,caseNumber:item.caseNumber,itemNumber:item.itemNumber,result:explicit}};
 }
 if(item.observationStatus==='observed'&&current&&item.detail?.observedAt){
  return{state:'observed',reason:`상세 기일 확인 · ${current.date} · ${current.result?`기일결과 ${current.result}(최종 상태 재확인 필요)`:'기일결과 미확인'}`,checked_at:item.detail.observedAt,source_url:item.sourceUrl,evidence:{lastSeenAt:item.lastSeenAt,schedule:current}};
 }
 return {state:item.observationStatus==='needs-review'?'needs-review':'observed',reason:'목록에서 관측됨 · 종료 확인 아님',checked_at:item.lastSeenAt,source_url:item.sourceUrl,evidence:{lastSeenAt:item.lastSeenAt}};
}
