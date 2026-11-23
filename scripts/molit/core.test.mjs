import test from 'node:test';
import assert from 'node:assert/strict';
import {leafRegions,monthsBack,decode,toRow,cancelDate} from './core.mjs';

test('leafRegions drops cities whose 구 are listed and keeps capital-area codes only',()=>{
 const r=leafRegions({'서울특별시 강남구':'11680','경기도 고양시':'41280','경기도 고양시 덕양구':'41281','경기도 과천시':'41290','전라남도 여수시':'46130'});
 assert.deepEqual(r.map(x=>x.code),['11680','41281','41290']);
});

test('monthsBack lists newest first across a year boundary',()=>{
 assert.deepEqual(monthsBack(new Date('2026-02-10T00:00:00+09:00'),4),['202602','202601','202512','202511']);
});

test('decode reads totals and single items and rejects error envelopes',()=>{
 const one=decode('<response><header><resultCode>000</resultCode></header><body><items><item><aptNm>은마</aptNm></item></items><totalCount>1</totalCount></body></response>');
 assert.equal(one.total,1);assert.equal(one.rows[0].aptNm,'은마');
 assert.equal(decode('<response><header><resultCode>000</resultCode></header><body><items></items><totalCount>0</totalCount></body></response>').rows.length,0);
 assert.throws(()=>decode('<OpenAPI_ServiceResponse><cmmMsgHeader><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>'),/API_22/);
});

test('toRow parses money, dates, cancellations and keeps sale/rent identity',()=>{
 const sale=toRow('aptSale','11680','202609',{aptNm:'은마',umdNm:'대치동',jibun:'316',excluUseAr:'76.79',floor:'14',buildYear:'1979',dealYear:'2026',dealMonth:'9',dealDay:'11',dealAmount:'312,000',dealingGbn:'중개거래',cdealDay:' '});
 assert.equal(sale.amount,312000);assert.equal(sale.deal_date,'2026-09-11');assert.equal(sale.cancel_date,null);assert.equal(sale.kind,'apt');
 const rent=toRow('offiRent','11680','202609',{offiNm:'폴스타인',excluUseAr:'38.33',dealYear:'2026',dealMonth:'9',dealDay:'5',deposit:'10,000',monthlyRent:'150'});
 assert.equal(rent.name,'폴스타인');assert.equal(rent.deposit,10000);assert.equal(rent.monthly_rent,150);assert.equal(rent.deal,'rent');
 assert.notEqual(sale.key,toRow('aptSale','11680','202609',{aptNm:'은마',dealAmount:'312,001'}).key);
 assert.equal(cancelDate('26.09.30'),'2026-09-30');
});

// 2026-11-22: MOLIT filled aptDong into September filings, and the full-item hash gave ~2,000 trades a
// second row. A reload keeps the earlier key when only a later-filled field changed.
import {assignKeys,stableOf,kaptLots,lotKey} from './core.mjs';
test('assignKeys keeps the old key when MOLIT fills in a field later',()=>{
 const item={aptNm:'북서울자이폴라리스',umdNm:'미아동',jibun:'1374',excluUseAr:'84.96',floor:'20',dealYear:'2026',dealMonth:'9',dealDay:'15',deposit:'57,700',monthlyRent:'0'};
 const before=toRow('aptRent','11305','202609',item);
 const old=[{...before,key:`${before.key}#1`}];
 const after=toRow('aptRent','11305','202609',{...item,aptDong:'201'});
 assert.notEqual(after.key,before.key);
 const [r]=assignKeys([after],old);
 assert.equal(r.key,`${before.key}#1`);
 assert.equal(r.building,'201');
});
test('assignKeys: unchanged filings keep their key, new trades get a new one, twins stay apart',()=>{
 const a={aptNm:'A',umdNm:'동',jibun:'1',excluUseAr:'59',floor:'3',dealYear:'2026',dealMonth:'9',dealDay:'1',dealAmount:'50,000'};
 const ra=toRow('aptSale','11110','202609',a);
 const old=[{...ra,key:`${ra.key}#1`},{...ra,key:`${ra.key}#2`}];   // two identical filings
 const b={...a,dealDay:'2'};
 const out=assignKeys([toRow('aptSale','11110','202609',a),toRow('aptSale','11110','202609',{...a,aptDong:'101'}),toRow('aptSale','11110','202609',b)],old);
 assert.deepEqual(out.slice(0,2).map(r=>r.key).sort(),[`${ra.key}#1`,`${ra.key}#2`].sort());
 assert.equal(new Set(out.map(r=>r.key)).size,3);
 assert.ok(out[2].key.endsWith('#1')&&!out[2].key.startsWith(ra.key));
});
test('assignKeys never reuses one old key twice, and a cancellation keeps the key',()=>{
 const a={aptNm:'A',umdNm:'동',jibun:'1',excluUseAr:'59',floor:'3',dealYear:'2026',dealMonth:'9',dealDay:'1',dealAmount:'50,000'};
 const ra=toRow('aptSale','11110','202609',a);
 const out=assignKeys([toRow('aptSale','11110','202609',{...a,cdealDay:'26.10.01'}),toRow('aptSale','11110','202609',{...a,aptDong:'1'})],[{...ra,key:`${ra.key}#1`}]);
 assert.equal(out[0].key,`${ra.key}#1`);
 assert.equal(out[0].cancel_date,'2026-10-01');
 assert.notEqual(out[1].key,out[0].key);
 assert.equal(stableOf(out[0]),stableOf(ra));
});
test('kaptLots reads the lot of a K-APT complex in MOLIT spelling',()=>{
 const lots=kaptLots([
  {bjd_code:'2638010600',dong:'다대동',jibun_address:'부산광역시 사하구 다대동 930 대건아파트'},
  {bjd_code:'4150025322',dong:'부발읍 죽당리',jibun_address:'경기도 이천시 부발읍 죽당리 1549 이천미라지움아파트'},
  {bjd_code:'1233010800',dong:'소촌동',jibun_address:'전남광주통합특별시 광산구 소촌동 290-1 소촌라인1차'},
  {bjd_code:'1111010100',dong:'청운동',jibun_address:'서울특별시 종로구 청운동 산 단지'},
  {bjd_code:null,dong:'x',jibun_address:'x 1'},
 ]);
 assert.deepEqual([...lots],[lotKey('26380','다대동','930'),lotKey('41500','부발읍 죽당리','1549'),lotKey('12330','소촌동','290-1')]);
});
test('kaptLots reads "230-" as 230 and skips a dong repeated in the name (2026-11-23)',()=>{
 const lots=kaptLots([
  {bjd_code:'4719012100',dong:'도량동',jibun_address:'경상북도 구미시 도량동 230- 도량아이센스'},
  {bjd_code:'4420025330',dong:'배방읍 휴대리',jibun_address:'충청남도 아산시 배방읍 휴대리 212 아산 휴대리 한성아파트'},
 ]);
 assert.deepEqual([...lots],[lotKey('47190','도량동','230'),lotKey('44200','배방읍 휴대리','212')]);
});

// 2026-11-22: MOLIT keeps some sales twice (rt.molit.go.kr: two 신고번호, the earlier one without 동·등기일).
import {staleFilingKeys} from './core.mjs';
test('staleFilingKeys drops the empty earlier filing that a filled one stands for',()=>{
 const base={aptNm:'경희궁자이(3단지)',umdNm:'평동',jibun:'233',excluUseAr:'59.8547',floor:'2',dealYear:'2026',dealMonth:'3',dealDay:'7',dealAmount:'230,000',estateAgentSggNm:'서울 종로구'};
 const row=(key,extra)=>({key,raw:JSON.stringify({...base,...extra})});
 assert.deepEqual(staleFilingKeys([row('filled',{aptDong:'305',rgstDate:'26.06.30'}),row('empty',{aptDong:' ',rgstDate:' '})]),['empty']);
 // Two different units, both filled: nothing dropped.
 assert.deepEqual(staleFilingKeys([row('a',{aptDong:'301',rgstDate:'26.06.30'}),row('b',{aptDong:'305',rgstDate:'26.06.01'})]),[]);
 // An empty filing differing in any other field (another agent) stays.
 assert.deepEqual(staleFilingKeys([row('filled',{aptDong:'305',rgstDate:'26.06.30'}),row('empty',{aptDong:'',rgstDate:'',estateAgentSggNm:'서울 중구'})]),[]);
 // Only 동 filled (등기 not yet): not the pattern, nothing dropped.
 assert.deepEqual(staleFilingKeys([row('half',{aptDong:'305',rgstDate:''}),row('empty',{aptDong:'',rgstDate:''})]),[]);
 // One filled filing covers one empty one.
 assert.deepEqual(staleFilingKeys([row('f',{aptDong:'305',rgstDate:'26.06.30'}),row('e1',{}),row('e2',{})]),['e1']);
});
