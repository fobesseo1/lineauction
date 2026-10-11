import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planDetails } from './detail-plan.mjs';
const now = new Date('2026-10-07T05:00:00Z');
const item = (key, extra={}) => ({key,court:'서울중앙지방법원',caseNumber:'2026타경1',itemNumber:1,page:7,pageSize:40,use:'아파트',auctionDate:'2026-10-08',assetCategory:'real-estate',observationStatus:'observed',assets:[{address:'서울특별시 강남구 도곡동'}],...extra});
const state = items => ({items:Object.fromEntries(items.map(i=>[i.key,i])),detailQueue:Object.fromEntries(items.map(i=>[i.key,{key:i.key,page:1,pageSize:10,attempts:0}]))});
test('최신 목록 위치 사용, 재확인·비부동산·완료 제외',()=>{
 const s=state([item('a'),item('b',{observationStatus:'needs-recheck'}),item('c',{assetCategory:'non-real-estate'}),item('d',{detail:{}})]);
 const p=planDetails(s,{now});assert.equal(p.nextBatch.length,1);assert.equal(p.nextBatch[0].page,7);assert.equal(p.nextBatch[0].pageSize,40);assert.equal(p.needsRecheck,1);
});
test('실패는 쿨다운 후 재시도하며 한 호출은 같은 법원·페이지 최대 4건',()=>{
 const s=state(Array.from({length:7},(_,i)=>item(String(i),{page:i===6?8:7})));
 s.detailQueue['0']={key:'0',attempts:2,lastAttemptAt:'2026-10-07T04:00:00Z'};
 const p=planDetails(s,{now});assert.equal(p.cooldown,1);assert.equal(p.nextBatch.length,4);assert.ok(p.nextBatch.every(j=>j.page===7&&j.key!=='0'));
 assert.equal(planDetails(s,{now:new Date('2026-10-07T09:00:00Z')}).cooldown,0);
});
test('가까운 입찰 아파트를 우선하고 없는 날짜를 임의 생성하지 않는다',()=>{
 const s=state([item('a',{auctionDate:null,page:8}),item('b',{use:'전답',page:9}),item('c')]);
 assert.equal(planDetails(s,{now}).nextBatch[0].key,'c');
 assert.throws(()=>planDetails(s,{now,limit:100}),/1..4/);
});
test('수도권(서울·경기·인천)은 법원이 아닌 물건 주소로 구분하며 복합 소재지는 검토 대상으로 남긴다',()=>{
 const s=state([item('a',{court:'인천지방법원',assets:[{address:'경기도 김포시 사우동'}]}),item('b',{assets:[{address:'부산광역시 해운대구'}]}),item('c',{assets:[{address:'서울특별시 강남구'},{address:'충청남도 천안시'}]})]);
 const p=planDetails(s,{now});assert.equal(p.outsideScope,2);assert.equal(p.nextBatch[0].key,'a');
 assert.equal(planDetails(s,{now,scope:'all'}).outsideScope,0);
});
test('이전 상태의 페이지 크기가 없으면 수집 근거의 페이지 크기를 사용한다',()=>{
 const s=state([item('a',{pageSize:undefined})]);
 assert.equal(planDetails(s,{now,courtCoverage:[{court:'서울중앙지방법원',pageSize:40}]}).nextBatch[0].pageSize,40);
});
