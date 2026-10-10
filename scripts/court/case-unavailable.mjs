// A negative response confirms only public availability, never sale or closure.
export function unavailableCaseEvidence(item,{queryRaw,body,sourceUrl,observedAt}) {
 if(!body.includes('해당 사건번호는 잘못된 번호입니다.'))return null;
 if(new URL(sourceUrl).origin!=='https://www.courtauction.go.kr'||!Number.isFinite(Date.parse(observedAt)))throw Error('Invalid case provenance');
 if(!queryRaw.includes(item.court)||queryRaw.replace(/\s/g,'').match(/\d{4}타경\d+/)?.[0]!==item.caseNumber)throw Error('Case search identity mismatch');
 return {court:item.court,caseNumber:item.caseNumber,itemNumber:item.itemNumber,sourceUrl,observedAt,caseOutcome:null,propertyFound:false,detailAvailable:false,propertyRaw:'',latestResult:null,verification:'official-case-search',itemClosureConfirmed:false,unavailableReason:'official-case-number-not-provided'};
}
