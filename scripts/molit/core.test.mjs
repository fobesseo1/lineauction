import test from 'node:test';
import assert from 'node:assert/strict';
import {leafRegions,monthsBack,decode,toRow,cancelDate} from './core.mjs';

test('leafRegions drops cities whose 구 are listed and keeps capital-area codes only',()=>{
 const r=leafRegions({'서울특별시 강남구':'11680','경기도 고양시':'41280','경기도 고양시 덕양구':'41281','경기도 과천시':'41290','부산광역시 중구':'26110'});
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
