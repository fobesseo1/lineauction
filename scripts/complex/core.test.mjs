import test from 'node:test';
import assert from 'node:assert/strict';
import {decode,listItems,jibunPnu,date8,fromList,fromBasis,fromDetail} from './core.mjs';

test('decode returns body on success and throws the provider code otherwise',()=>{
 const body=decode('{"response":{"body":{"items":[{"kaptCode":"A1"}],"totalCount":1},"header":{"resultCode":"00"}}}');
 assert.equal(body.totalCount,1);
 assert.deepEqual(listItems(body),[{kaptCode:'A1'}]);
 assert.throws(()=>decode('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'),/API_30/);
 assert.throws(()=>decode('{"response":{"header":{"resultCode":"22"}}}'),/API_22/);
 assert.throws(()=>decode('{"OpenAPI_ServiceResponse":{"cmmMsgHeader":{"returnReasonCode":"23"}}}'),/API_23/);
});

test('listItems accepts array, single item and empty bodies',()=>{
 assert.deepEqual(listItems({items:{item:{kaptCode:'A'}}}),[{kaptCode:'A'}]);
 assert.deepEqual(listItems({items:''}),[]);
});

test('jibunPnu builds PNU from the first lot after the dong',()=>{
 assert.equal(jibunPnu('1171010100','서울특별시 송파구 잠실동 187-10 잠실 센트럴파크'),'1171010100101870010');
 assert.equal(jibunPnu('1171010700','서울특별시 송파구 가락동 913 헬리오시티'),'1171010700109130000');
 assert.equal(jibunPnu('4113510900','경기도 성남시 분당구 정자동 산 12-3 어딘가'),'4113510900200120003');
 assert.equal(jibunPnu('4146110100','경기도 용인시 처인구 김량장동 123외 2필지 단지'),'4146110100101230000');
 assert.equal(jibunPnu('1111016400','서울특별시 종로구 충신동 60- 힐스테이트 창경궁'),'1111016400100600000');
 assert.equal(jibunPnu('2817710100','인천광역시 미추홀구 주안동 1번지'),null);
 assert.equal(jibunPnu(null,'서울 어딘가동 1'),null);
});

test('date8 rejects impossible dates',()=>{
 assert.equal(date8('20230802'),'2023-08-02');
 assert.equal(date8('20230230'),null);
 assert.equal(date8(' '),null);
});

test('row mappers keep identity and parse numbers',()=>{
 const l=fromList({kaptCode:'A10023070',kaptName:'잠실 센트럴파크',bjdCode:'1171010100',as1:'서울특별시',as2:'송파구',as3:'잠실동',as4:null},'11','2026-10-11T00:00:00Z');
 assert.equal(l.dong,'잠실동');assert.equal(l.sigungu,'송파구');
 const b=fromBasis({kaptName:'잠실 센트럴파크',bjdCode:'1171010100',kaptAddr:'서울특별시 송파구 잠실동 187-10 잠실 센트럴파크',kaptdaCnt:217.0,kaptDongCnt:'1',kaptUsedate:'20230802',privArea:'5805.5371',kaptMparea60:217.0},'t');
 assert.equal(b.households,217);assert.equal(b.dong_count,1);assert.equal(b.approved_on,'2023-08-02');assert.equal(b.private_area,5805.5371);assert.equal(b.pnu,'1171010100101870010');
 const d=fromDetail({kaptdPcnt:'70',kaptdPcntu:'66',kaptdEcnt:4,subwayLine:'2호선',subwayStation:null},'t');
 assert.equal(d.parking_underground,66);assert.equal(d.subway_station,null);
 assert.equal(fromBasis({kaptdaCnt:0,hoCnt:230},'t').households,230);
 assert.equal(fromBasis({kaptdaCnt:0,hoCnt:0},'t').households,null);
});
