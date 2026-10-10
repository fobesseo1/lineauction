// Read up to five distinct public photos already displayed by the official detail page.
export async function readAllOfficialPhotos(page) {
 try {
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('img')).some(e=>e.getClientRects().length&&/^(전경도|관련사진)_\d+$/.test(e.alt)),null,{timeout:1000,polling:100});
 } catch(error) { if(error.name==='TimeoutError')return [];throw error; }
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('img')).filter(e=>e.getClientRects().length&&/^(전경도|관련사진)_\d+$/.test(e.alt)).every(e=>e.complete&&e.naturalWidth>0),null,{timeout:20000,polling:100});
 const photos=await page.locator('img:visible').evaluateAll(es=>es.filter(e=>/^(전경도|관련사진)_\d+$/.test(e.alt)&&e.src.startsWith('data:image/')&&e.complete&&e.naturalWidth>0).map(e=>({alt:e.alt,dataUrl:e.src})));
 return [...new Map(photos.map(photo=>[photo.dataUrl,photo])).values()].slice(0,5);
}
