// Paste these function literals into CUA. All values come from the visible official DOM.
export async function collectCourtPhotos(tab,item){
 const detailRaw=await tab.playwright.getByRole('table').filter({visible:true}).evaluateAll(es=>es.map(e=>e.innerText).join('\n'));
 const entries=await tab.playwright.getByRole('img').filter({visible:true}).evaluateAll(es=>es.filter(e=>/^(전경도|관련사진)_\d+$/.test(e.alt)&&e.src.startsWith('data:image/')).map(e=>({alt:e.alt,parts:e.src.match(/.{1,24000}/g)})));
 if(!entries.length)return null;
 const photos=entries.map(e=>({alt:e.alt,dataUrl:e.parts.join('')}));if(photos.some(e=>e.dataUrl.includes('[Truncated]')))throw Error('Truncated photo payload');
 return{kind:'court-media',key:item.key,court:item.court,caseNumber:item.caseNumber,itemNumber:item.itemNumber,sourceUrl:await tab.url(),observedAt:new Date().toISOString(),detailRaw,photos};
}
export async function collectCourtResultPage(tab,court){
 const query=await tab.playwright.getByRole('table',{name:'검색조건 을(를) 나타낸 표',exact:true}).innerText();
 if(!query.includes(court))throw Error('Wrong result court');
 const rows=await tab.playwright.getByRole('table',{name:'물건번호,소재지 및 내역,비고,용도,매각결과 매각대금 (단위:원) 을(를) 나타낸 표',exact:true}).locator('tbody tr').filter({visible:true}).evaluateAll(es=>es.map(e=>Array.from(e.querySelectorAll('td')).map(c=>c.innerText)));
 return{kind:'court-results',court,query,sourceUrl:await tab.url(),observedAt:new Date().toISOString(),rows};
}
