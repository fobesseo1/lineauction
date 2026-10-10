import test from 'node:test';
import assert from 'node:assert/strict';
import {mapCourtProperty,apartmentTarget,recentMonths,comparisonExclusion} from './pipeline-core.mjs';
import {classifyApartmentTrade} from '../experiments/comparison.mjs';
const item={key:'법원:2023타경1:1',court:'법원',caseNumber:'2023타경1',itemNumber:1,assets:[{address:'서울특별시 강남구 선릉로 221 407동 9층903호 (도곡동,도곡렉슬아파트)'}],use:'아파트',assetCategory:'real-estate',validationIssues:[],appraisalWon:3320000000,minimumBidWon:2656000000,status:'유찰 1회',auctionDate:'2026-10-08',detail:{exclusiveAreaM2:119.8906,raw:'1동의 건물의 표시\n 서울특별시 강남구 도곡동 527\n 도곡렉슬아파트'}};
test('법원 사건과 물건번호를 별도로 식별하고 미확인 입찰시각은 만들지 않음',()=>{
 const p=mapCourtProperty(item);assert.equal(p.source_property_id,'법원:2023타경1');assert.equal(p.auction_condition_id,'1');assert.equal(p.minimum_bid_price,'2656000000');assert.equal(p.bid_end_at,null);assert.equal(p.exclusive_area,119.8906);
 assert.equal(p.dong,'도곡동');
 assert.equal(mapCourtProperty({...item,assetCategory:'needs-classification'}),null);
 assert.equal(mapCourtProperty({...item,validationIssues:['missing-price']}),null);
});
test('상세 지번·법정동·전유면적이 없으면 단지 비교를 만들지 않음',()=>{
 assert.equal(apartmentTarget(item).jibun,'527');
 assert.equal(apartmentTarget({...item,detail:null}),null);
 assert.equal(apartmentTarget({...item,detail:{...item.detail,raw:item.detail.raw.replace('도곡동','대치동')}}),null);
 assert.equal(apartmentTarget({...item,use:'오피스텔'}),null);
});
test('동 일치 강제 없이 다른 면적과 해제거래를 제외하고 층 차이를 보존',()=>{
 const target=apartmentTarget(item);
 const trade={aptNm:'도곡렉슬',umdNm:'도곡동',jibun:'527',excluUseAr:'119.8906',floor:'5',aptDong:'405',dealYear:'2026',dealMonth:'8',dealDay:'12',dealAmount:'415,000'};
 const result=classifyApartmentTrade(target,trade,'2026-10-07');
 assert.equal(result.eligible,true);assert.equal(result.amountWon,4150000000);assert.equal(result.floorDelta,4);
 assert.equal(classifyApartmentTrade(target,{...trade,excluUseAr:'84.9'},'2026-10-07').eligible,false);
 assert.equal(classifyApartmentTrade(target,{...trade,cdealType:'O'},'2026-10-07').eligible,false);
});
test('최근 6개월 조회가 연도를 넘어도 현재월부터 연속됨',()=>assert.deepEqual(recentMonths(new Date('2026-01-07T00:00:00Z')),['202601','202512','202511','202510','202509','202508']));
test('경기 고양의 시·구를 함께 식별하고 목록과 상세 지역 불일치 거절',()=>{
 const targetItem={...item,assets:[{address:'경기도 고양시 일산동구 위시티4로 45 407동 14층1402호 (식사동,위시티일산자이4단지)'}],detail:{exclusiveAreaM2:162.7081,raw:'1동의 건물의 표시\n 경기도 고양시 일산동구 식사동 1504\n 위시티일산자이4단지'}};
 const t=apartmentTarget(targetItem);assert.equal(t.regionCode,'41285');assert.equal(t.jibun,'1504');assert.equal(t.floor,14);
 assert.equal(apartmentTarget({...targetItem,detail:{...targetItem.detail,raw:targetItem.detail.raw.replace('일산동구','일산서구')}}),null);
});
test('괄호 없는 공식 지번 주소도 상세의 단지·지번을 대조해야 연결한다',()=>{
 const targetItem={...item,assets:[{address:'경기도 고양시 일산동구 사리현동 189 동문아파트 303동 4층404호'}],detail:{exclusiveAreaM2:84.6186,raw:'1동의 건물의 표시\n 경기도 고양시 일산동구 사리현동 189\n 동문아파트'}};
 const t=apartmentTarget(targetItem);assert.equal(t.complex,'동문');assert.equal(t.floor,4);assert.equal(t.jibun,'189');
 assert.equal(apartmentTarget({...targetItem,assets:[{address:targetItem.assets[0].address.replace('189','190')}]}),null);
 assert.equal(apartmentTarget({...targetItem,assets:[{address:targetItem.assets[0].address.replace('동문아파트','다른아파트')}]}),null);
});
test('읍·리 주소는 시군 코드와 읍리 전체 명칭을 보존한다',()=>{
 const candidate={...item,assets:[{address:'경기도 남양주시 진건읍 용정리 369-1 금강아파트 106동 1층103호'}],detail:{exclusiveAreaM2:59.86,raw:'1동의 건물의 표시\n 경기도 남양주시 진건읍 용정리 369-1\n 금강아파트'}};
 const t=apartmentTarget(candidate);assert.equal(t.regionCode,'41360');assert.equal(t.umdNm,'진건읍 용정리');assert.equal(t.jibun,'369-1');
});

test('공식 주소의 제9층·제720동 표기도 동일한 층·단지로 판독한다',()=>{
 const prefixed={...item,assets:[{address:item.assets[0].address.replace('407동 9층','제407동 제9층')}]};
 assert.equal(apartmentTarget(prefixed).floor,9);
 const lot={...item,assets:[{address:'서울특별시 강서구 화곡동 917-14 삼성다빈치 제7층 제703호'}],detail:{exclusiveAreaM2:14.35,raw:'1동의 건물의 표시\n 서울특별시 강서구 화곡동 917-14\n 삼성다빈치'}};
 assert.equal(apartmentTarget(lot).floor,7);assert.equal(apartmentTarget(lot).complex,'삼성다빈치');
 assert.equal(apartmentTarget({...lot,detail:{...lot.detail,raw:lot.detail.raw.replace('917-14','917-15')}}),null);
});
test('지분매각과 일괄매각은 전체 주택 가격과 직접 비교하지 않는다',()=>{
 const share={...item,detail:{...item.detail,raw:item.detail.raw+'\n1. 지분매각임.\n매각지분 : 갑구3번) 2분1 소유자 지분 전부'}};
 assert.equal(apartmentTarget(share),null);assert.match(comparisonExclusion(share),/지분/);
 assert.equal(apartmentTarget({...item,assets:[...item.assets,...item.assets]}),null);
});

test('24-month MOLIT coverage preserves contiguous year boundaries',()=>{const months=recentMonths(new Date('2026-10-10T00:00:00Z'),24);assert.equal(months.length,24);assert.equal(months[0],'202610');assert.equal(months[23],'202411');assert.equal(new Set(months).size,24);});
