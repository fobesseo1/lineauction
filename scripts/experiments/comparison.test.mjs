import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyApartmentTrade,parseCourtRows,diffObservedItem} from './comparison.mjs';
const target={complex:'도곡렉슬',umdNm:'도곡동',jibun:'527',area:119.8906,floor:9,minimumBidWon:2656000000};
const trade={aptNm:'도곡렉슬',umdNm:'도곡동',jibun:'527',excluUseAr:'119.8906',dealAmount:'415,000',dealYear:'2026',dealMonth:'8',dealDay:'12',floor:'5'};
test('same area trade converts 만원 and allows undisclosed building',()=>{
  const r=classifyApartmentTrade(target,trade,'2026-10-07');
  assert.equal(r.eligible,true);assert.equal(r.amountWon,4150000000);assert.equal(r.minimumBidGapPercent,36);
});
test('same complex different area is excluded',()=>assert.equal(classifyApartmentTrade(target,{...trade,excluUseAr:'120.8286'},'2026-10-07').eligible,false));
test('cancelled, wrong address and future records are excluded',()=>{
  for(const change of [{cdealType:'O'},{jibun:'528'},{dealMonth:'11'}]) assert.equal(classifyApartmentTrade(target,{...trade,...change},'2026-10-07').eligible,false);
});
test('missing area, price and impossible dates cannot produce a gap',()=>{
  for(const change of [{excluUseAr:''},{dealAmount:''},{dealMonth:'2',dealDay:'30'}]) assert.equal(classifyApartmentTrade(target,{...trade,...change},'2026-10-07').minimumBidGapPercent,null);
});
test('same named complex elsewhere does not match',()=>assert.equal(classifyApartmentTrade(target,{...trade,umdNm:'다른동'},'2026-10-07').eligible,false));
const cells = values=>values.map(text=>({text}));
test('bundled land/building stays one item; same case different item stays separate',()=>{
  const first=cells(['','서울중앙지방법원2023타경106314','1','토지99㎡','지도','일괄매각','813,440,070','2026.10.15']);
  const continuation=cells(['','','','건물59.37㎡','지도','','','']);
  const next=cells(['','서울중앙지방법원2023타경106314','2','다른물건','지도','','200,000,000','2026.10.15']);
  const r=parseCourtRows([first,cells(['단독주택','650,753,000(80%)','유찰1회']),continuation,cells(['','','']),next,cells(['대지','100,000,000','신건'])],'서울중앙지방법원');
  assert.equal(r.length,2);assert.equal(r[0].assets.length,2);assert.equal(r[0].minimumBidWon,650753000);assert.notEqual(r[0].key,r[1].key);
});
test('missing page record is not automatically withdrawn',()=>{
  const before={key:'court:case:1',minimumBidWon:10,status:'신건',auctionDate:'2026-10-08'};
  assert.equal(diffObservedItem(before,null).state,'needs-recheck');
  assert.deepEqual(diffObservedItem(before,{...before,minimumBidWon:8}).changes,['minimumBidWon']);
  assert.equal(diffObservedItem(before,{...before}).state,'unchanged');
});
