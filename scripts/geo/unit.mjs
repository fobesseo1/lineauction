// Building 동 and unit 호 from a court/Onbid address, in the form the 공시가격 data uses
// ("6", "108", "비"; "1503", "B101"). The legal dong before the lot ("구로동 685-124") is not a
// building 동: only a "…동" followed by a floor counts.
//   "… 중앙구로하이츠아파트 제6동 제15층 제1503호" → {dong:'6', ho:'1503'}
//   "… 4층403호" → {dong:null, ho:'403'}
export function unitOf(address){
 const a=String(address??'').split(' / ')[0].replace(/\([^()]*\)\s*$/,'');
 const dongs=[...a.matchAll(/(?:^|\s)(?:제\s*)?([A-Za-z0-9가-힣]{1,6}?)\s*동\s*(?:제\s*)?(?:지하\s*)?\d+\s*층/g)];
 const hos=[...a.matchAll(/(?:층\s*|\s)(?:제\s*)?([A-Za-z]?\d{1,5}[A-Za-z]?(?:-\d+)?)\s*호/g)];
 const ho=hos.at(-1)?.[1]??null;
 return {dong:dongs.at(-1)?.[1]??null,ho};
}
