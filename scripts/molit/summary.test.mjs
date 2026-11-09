import test from 'node:test';
import assert from 'node:assert/strict';
import {jibunPnu,median,areaStats,periodStart,placeId,monthlyHistory,similarName,nameOrdinals,sharesNamePart,applyManualLinks} from './summary.mjs';

test('applyManualLinks replaces a building\'s complex or adds one',()=>{
 const places=new Map([['a',{id:'a',kapt_code:'WRONG',kapt_match:'near_name'}],['b',{id:'b',kapt_code:'RENTAL',kapt_match:'pnu'}]]);
 const out=applyManualLinks(places,[{place_id:'a',kapt_code:'K1',action:'primary'},{place_id:'b',kapt_code:'K2',action:'also'},{place_id:'gone',kapt_code:'K3',action:'primary'}]);
 assert.deepEqual(places.get('a'),{id:'a',kapt_code:'K1',kapt_match:'manual'});
 assert.equal(places.get('b').kapt_code,'RENTAL');
 assert.deepEqual(out,{extra:[{place_id:'b',kapt_code:'K2',kapt_match:'manual'}],missing:['gone']});
});

test('nameOrdinals reads 차수, 단지 lists and a trailing number',()=>{
 assert.deepEqual([...nameOrdinals('동두천신창비바패밀리1,2단지')],[1,2]);
 assert.deepEqual([...nameOrdinals('청광플러스원(큐브1차)')],[1]);
 assert.deepEqual([...nameOrdinals('영덕신일1')],[1]);
 assert.equal(nameOrdinals('한솔솔파크(501,502동)').size,0);
});

test('similarName accepts region prefixes and rejects other 차수',()=>{
 assert.ok(similarName('한솔솔파크(501,502동)','당정한솔솔파크'));
 assert.ok(similarName('DMC파크뷰자이1단지','DMC파크뷰자이아파트'));
 assert.ok(similarName('신창비바패밀리(1단지)','동두천신창비바패밀리1,2단지'));
 assert.ok(similarName('힐스테이트 평택 1차','힐스테이트 평택아파트'));
 assert.ok(!similarName('청광플러스원(큐브1차)','청광플러스원큐브3차'));
 assert.ok(!similarName('가산지웰에스테이트','가산지웰에스테이트2차'));
 assert.ok(!similarName('신곡우성','장암우성'));
 assert.ok(!similarName('주공1','주공12단지'));
 assert.ok(!similarName('진주(2차)','오남진주'));
});

test('similarName treats brand spellings as one name',()=>{
 assert.ok(similarName('매교역푸르지오SKVIEW','매교역푸르지오SK뷰'));
 assert.ok(similarName('고덕센트럴IPARK','고덕센트럴 아이파크'));
 assert.ok(similarName('다산이편한세상자이','다산 e편한세상자이'));
 assert.ok(similarName('THESHARP판교퍼스트파크','더샵판교퍼스트파크'));
 assert.ok(similarName('SK VIEW Park','SK뷰파크'));
 assert.ok(similarName('흑석XI','흑석자이'));
 assert.ok(similarName('이편한세상강동에코포레','e편한세상 강동에코포레 아파트'));
});

test('sharesNamePart finds a complex inside a combined MOLIT name',()=>{
 assert.ok(sharesNamePart('한국1,동아,팬더','갈산 팬더 아파트'));
 assert.ok(sharesNamePart('태산,대진.정광아파트','선학정광'));
 assert.ok(sharesNamePart('양지마을(6단지)(금호,청구)','수내양지마을청구'));
 assert.ok(sharesNamePart('한신1','하계한신'));
 assert.ok(!sharesNamePart('하나','갈산 동남 아파트'));
 assert.ok(!sharesNamePart('경남','연수1차대림'));
 assert.ok(!sharesNamePart('주공2단지','논현주공2-1단지'));
 assert.ok(!sharesNamePart('양지마을(5단지)(한양501-514)','양지마을 금호 1단지 아파트'));
});

test('jibunPnu handles plain, sub-lot and mountain lots',()=>{
 assert.equal(jibunPnu('1168010600','316'),'1168010600103160000');
 assert.equal(jibunPnu('1168010800','236-8'),'1168010800102360008');
 assert.equal(jibunPnu('1132010600','산69-1'),'1132010600200690001');
 assert.equal(jibunPnu(null,'316'),null);
 assert.equal(jibunPnu('1168010600','316외'),null);
});

test('median of odd and even lists',()=>{
 assert.equal(median([3,1,2]),2);assert.equal(median([1,2,3,10]),3);assert.equal(median([]),null);
});

test('areaStats excludes cancelled and 직거래 sales and computes the jeonse ratio',()=>{
 const t=[
  {deal:'sale',amount:100000,deal_date:'2026-03-01',floor:5,dealing:'중개거래'},
  {deal:'sale',amount:110000,deal_date:'2026-06-01',floor:9,dealing:'중개거래'},
  {deal:'sale',amount:50000,deal_date:'2026-07-01',floor:2,dealing:'직거래'},
  {deal:'sale',amount:120000,deal_date:'2026-08-01',floor:3,dealing:'중개거래',cancel_date:'2026-09-01'},
  {deal:'rent',deposit:60000,monthly_rent:0},{deal:'rent',deposit:50000,monthly_rent:0},{deal:'rent',deposit:10000,monthly_rent:150},
 ];
 const s=areaStats(t);
 assert.equal(s.sale_count,2);assert.equal(s.sale_median,105000);assert.equal(s.sale_last_amount,110000);assert.equal(s.sale_last_floor,9);
 assert.equal(s.jeonse_count,2);assert.equal(s.jeonse_median,55000);assert.equal(s.wolse_count,1);assert.equal(s.wolse_deposit_median,10000);assert.equal(s.wolse_rent_median,150);assert.equal(s.jeonse_ratio,52.4);
});

const jeonseDeal=(deposit,contract_type,deal_date='2026-03-01')=>({deal:'rent',deposit,monthly_rent:0,contract_type,deal_date});

test('areaStats prices jeonse from new contracts when there are three or more',()=>{
 const s=areaStats([
  {deal:'sale',amount:100000,deal_date:'2026-03-01',dealing:'중개거래'},
  jeonseDeal(70000,'신규'),jeonseDeal(80000,'신규'),jeonseDeal(90000,'신규'),
  jeonseDeal(20000,'갱신'),jeonseDeal(21000,'갱신'),jeonseDeal(22000,'갱신'),jeonseDeal(23000,null),
  {deal:'rent',deposit:10000,monthly_rent:150,contract_type:'신규'},
 ]);
 assert.equal(s.jeonse_basis,'new');assert.equal(s.jeonse_count,3);assert.equal(s.jeonse_median,80000);assert.equal(s.jeonse_ratio,80);
 assert.equal(s.wolse_count,1);
});

test('areaStats keeps every jeonse contract with fewer than three new ones, and blank is not new',()=>{
 const s=areaStats([jeonseDeal(70000,'신규'),jeonseDeal(80000,'신규'),jeonseDeal(20000,null),jeonseDeal(10000,''),jeonseDeal(30000,'갱신')]);
 assert.equal(s.jeonse_basis,'all');assert.equal(s.jeonse_count,5);assert.equal(s.jeonse_median,30000);
 assert.equal(areaStats([]).jeonse_basis,'all');
});

test('monthlyHistory uses one jeonse basis for every month',()=>{
 const trades=[jeonseDeal(70000,'신규','2026-01-05'),jeonseDeal(20000,'갱신','2026-01-20'),jeonseDeal(21000,'갱신','2026-02-10')];
 assert.equal(monthlyHistory(trades,['2026-01','2026-02'],'new').jeonse,'0:70000:1');
 assert.equal(monthlyHistory(trades,['2026-01','2026-02'],'all').jeonse,'0:45000:2,1:21000:1');
});

test('periodStart is one year back in KST and placeId is stable',()=>{
 assert.equal(periodStart(new Date('2026-10-12T01:00:00Z')),'2025-10-12');
 assert.equal(placeId('apt','11680','대치동','316'),'apt:11680:대치동:316');
});

test('monthlyHistory lines up medians with the month list',()=>{
 const h=monthlyHistory([
  {deal:'sale',amount:100,deal_date:'2026-01-05',dealing:'중개거래'},{deal:'sale',amount:120,deal_date:'2026-01-20',dealing:'중개거래'},
  {deal:'sale',amount:999,deal_date:'2026-01-21',dealing:'직거래'},{deal:'rent',deposit:50,monthly_rent:0,deal_date:'2026-03-01'},
  {deal:'sale',amount:80,deal_date:'2025-01-01',dealing:'중개거래'},
 ],['2026-01','2026-02','2026-03']);
 assert.deepEqual(h,{from:'2026-01',sale:'0:110:2',jeonse:'2:50:1'});
});
