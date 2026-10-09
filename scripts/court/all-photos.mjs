// Read every public photo already displayed by the official detail page.
// Never request private endpoints or substitute another property's images.
export async function readAllOfficialPhotos(page) {
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('img')).filter(e=>e.getClientRects().length&&/^(전경도|관련사진)_\d+$/.test(e.alt)).every(e=>e.complete&&e.naturalWidth>0),null,{timeout:20000});
 const photos=await page.locator('img:visible').evaluateAll(es=>es.filter(e=>/^(전경도|관련사진)_\d+$/.test(e.alt)&&e.src.startsWith('data:image/')&&e.complete&&e.naturalWidth>0).map(e=>({alt:e.alt,dataUrl:e.src})));
 return [...new Map(photos.map(photo=>[photo.dataUrl,photo])).values()];
}
