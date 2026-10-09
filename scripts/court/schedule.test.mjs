import {test} from 'node:test';
import assert from 'node:assert/strict';
import {detailSchedule} from './schedule.mjs';
import {lifecycleFromItem} from './lifecycle.mjs';
const raw='기일\t기일종류\t기일장소\t최저매각가격\t기일결과\n2026.09.16 (10:00)\t매각기일\t법정\t663,000,000원\t유찰\n2026.10.21 (10:00)\t매각기일\t법정\t464,100,000원\t\n2026.10.28 (14:00)\t매각결정기일\t법정\t\t\n목록번호,목록구분,상세내역';
test('상세 기일의 유찰과 결과 공란을 분리하고 결정기일은 제외',()=>{
 const rows=detailSchedule(raw);assert.equal(rows.length,2);assert.equal(rows[0].result,'유찰');assert.equal(rows[1].result,null);
 assert.deepEqual(detailSchedule(raw.replaceAll('\t',' ')),[]);
});
test('현재 기일·가격이 일치하는 상세만 표시하며 과거 유찰로 종료하지 않는다',()=>{
 const item={auctionDate:'2026-10-21',minimumBidWon:464100000,observationStatus:'observed',lastSeenAt:'2026-10-07T05:00:00Z',detail:{raw,observedAt:'2026-10-07T05:00:00Z'}};
 const result=lifecycleFromItem(item);assert.equal(result.state,'observed');assert.match(result.reason,/상세 기일 확인.*기일결과 미확인/);
 assert.doesNotMatch(lifecycleFromItem({...item,minimumBidWon:1}).reason,/상세 기일 확인/);
 assert.equal(lifecycleFromItem({...item,observationStatus:'needs-recheck'}).state,'needs-recheck');
});
test('정확한 사건·물건의 현재 기일에 명시된 종료 결과만 종료로 분류한다',()=>{
 const base={court:'고양지원',caseNumber:'2025타경1',itemNumber:1,auctionDate:'2026-09-16',minimumBidWon:663000000,observationStatus:'observed',sourceUrl:'https://www.courtauction.go.kr/pgj/index.on',lastSeenAt:'2026-10-07T05:00:00Z'};
 for(const result of ['매각','취하','취소']){
  const detail={raw:`2025타경1 물건번호 1 물건종류\n${raw.replace('유찰',result)}`,observedAt:base.lastSeenAt};
  assert.equal(lifecycleFromItem({...base,detail}).state,'closed');
  assert.notEqual(lifecycleFromItem({...base,itemNumber:2,detail}).state,'closed');
  assert.notEqual(lifecycleFromItem({...base,auctionDate:'2026-10-21',minimumBidWon:464100000,detail}).state,'closed');
 }
});
