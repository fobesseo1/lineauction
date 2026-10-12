import test from 'node:test';
import assert from 'node:assert/strict';
import {tradeKind,sameDong,pnuLot,courtAddress,findPlace,marketPrice,shopFloor,outlier,dealScore,villaPrice} from './match.mjs';

test('tradeKind maps uses to MOLIT datasets',()=>{
 assert.equal(tradeKind('아파트','apartment'),'apt');
 assert.equal(tradeKind('도시형생활주택','apartment'),'apt');
 assert.equal(tradeKind('오피스텔','apartment'),'offi');
 assert.equal(tradeKind('상가,오피스텔,근린시설','apartment'),'offi');
 assert.equal(tradeKind('다세대','apartment'),'rh');assert.equal(tradeKind('연립주택,다세대,빌라','apartment'),'rh');
 assert.equal(tradeKind('아파트','commercial'),null);
});

test('sameDong accepts rural 읍+리 names either way',()=>{
 assert.ok(sameDong('향남읍 하길리','하길리'));assert.ok(sameDong('향남읍 하길리','향남읍'));assert.ok(sameDong('잠실동','잠실동'));
 assert.ok(!sameDong('잠실동','신천동'));assert.ok(!sameDong('잠실동',null));
});

test('pnuLot rebuilds the MOLIT 지번',()=>{
 assert.deepEqual(pnuLot('1154510200009730001'),{lawd:'11545',jibun:'973-1'});
 assert.deepEqual(pnuLot('1154510200003300000'),{lawd:'11545',jibun:'330'});
 assert.deepEqual(pnuLot('1132010600200690001'),{lawd:'11320',jibun:'산69-1'});
 assert.equal(pnuLot('123'),null);
});

test('courtAddress reads lot, rural lot and bracketed road addresses',()=>{
 assert.deepEqual(courtAddress('서울특별시 구로구 온수동 86-10 에코그린빌 제102동 제4층 제401호'),{dong:'온수동',jibun:'86-10',name:null});
 assert.deepEqual(courtAddress('경기도 용인시 처인구 모현읍 왕산리 551-22 5층501호'),{dong:'왕산리',jibun:'551-22',name:null});
 assert.deepEqual(courtAddress('경기도 성남시 분당구 정자일로 95 101동 3층 (정자동,아이파크분당)'),{dong:'정자동',jibun:null,name:'아이파크분당'});
 assert.deepEqual(courtAddress('경기도 파주시 파주읍 통일로1546번길 43-8 402동 3층304호 (더힐팰리스)'),{dong:null,jibun:null,name:'더힐팰리스'});
});

test('findPlace prefers the lot and falls back to a unique name',()=>{
 const places=[
  {id:'a',kind:'apt',lawd:'11530',umd:'온수동',jibun:'86-10',name:'에코그린빌'},
  {id:'b',kind:'apt',lawd:'41135',umd:'정자동',jibun:'10',name:'아이파크분당'},
  {id:'c',kind:'offi',lawd:'11530',umd:'온수동',jibun:'86-10',name:'오피스'},
 ];
 assert.equal(findPlace(places,{lawd:'11530',dong:'온수동',jibun:'86-10',kind:'apt'}).place.id,'a');
 assert.equal(findPlace(places,{lawd:'41135',dong:'정자동',jibun:null,name:'아이파크 분당',kind:'apt'}).via,'name');
 assert.equal(findPlace(places,{lawd:'41135',dong:'정자동',jibun:'99',kind:'apt'}),null);
});

test('marketPrice uses 6 months when there are 3 sales, else 12 with lower confidence',()=>{
 const s=(d,a)=>({deal_date:d,amount:a});
 const opts={since6:'2026-04-12',since12:'2025-10-12'};
 assert.deepEqual(marketPrice([s('2026-05-01',100),s('2026-06-01',110),s('2026-07-01',120),s('2025-12-01',90)],opts),{priceManwon:110,window:6,count:3,confidence:'high'});
 assert.deepEqual(marketPrice([s('2026-05-01',100),s('2025-12-01',90),s('2025-11-01',80)],opts),{priceManwon:90,window:12,count:3,confidence:'medium'});
 assert.equal(marketPrice([s('2026-05-01',100)],{...opts,neighbour:true}).confidence,'low');
 assert.equal(marketPrice([s('2024-01-01',100)],opts),null);
});

test('shopFloor keeps ground-floor and basement units of the mixed category out of officetel comparisons',()=>{
 assert.ok(shopFloor('상가,오피스텔,근린시설','경기도 하남시 망월동 1094 이편한세상시티미사 1층121호'));
 assert.ok(shopFloor('상가,오피스텔,근린시설','서울 어딘가 지하1층 B101호'));
 assert.ok(!shopFloor('상가,오피스텔,근린시설','경기도 하남시 학암동 661 17층1756호'));
 assert.ok(!shopFloor('오피스텔','경기도 1층101호'));
 assert.ok(outlier(-45));assert.ok(!outlier(-10));assert.ok(!outlier(null));
});

test('dealScore ranks a clean 25% discount above a troubled 90% discount',()=>{
 const clean=dealScore({discount:25,confidence:'high',riskFlags:[],failedBids:1});
 const troubled=dealScore({discount:90,confidence:'high',riskFlags:['선순위'],failedBids:12});
 assert.equal(clean.score,70);assert.equal(clean.grade,'A');
 assert.equal(troubled.score,35);assert.equal(troubled.grade,'C');
 assert.ok(clean.score>troubled.score);
 assert.equal(dealScore({discount:50,confidence:'high'}).score,100);
 assert.equal(dealScore({discount:70,confidence:'high'}).score,90);
 assert.equal(dealScore({discount:-20,confidence:'low'}).grade,'D');
 assert.equal(dealScore({discount:null}),null);
});

test('villaPrice scales the building or dong price per ㎡ to the unit area',()=>{
 const s=(d,amount,area,build_year=2015)=>({deal_date:d,amount,area,build_year});
 const since12='2025-10-12';
 const b=villaPrice({area:50,building:[s('2026-03-01',25000,49),s('2026-05-01',27000,51),s('2024-01-01',10000,50)],since12});
 assert.equal(b.basis,'building');assert.equal(b.count,2);assert.equal(b.confidence,'low');
 assert.equal(b.priceManwon,Math.round((25000/49+27000/51)/2)*50);  // median() rounds the per-㎡ price
 const dong=[1,2,3,4,5].map(i=>s('2026-0'+i+'-01',20000,40+i,2014)).concat([s('2026-06-01',99999,45,1990)]);
 const d=villaPrice({area:45,dong,buildYear:2015,since12});
 assert.equal(d.basis,'dong');assert.equal(d.count,5);assert.equal(d.confidence,'low');
 assert.equal(villaPrice({area:45,dong:dong.slice(0,3),since12}),null);
});

test('villaPrice narrows the dong comparison to similar land share when known',()=>{
 const s=(d,amount,area,land_area)=>({deal_date:d,amount,area,land_area,build_year:2015});
 const since12='2025-10-12';
 // 8 units with land share ~0.5 per ㎡ at ~600/㎡, 5 with ~0.15 at ~300/㎡
 const rich=[1,2,3,4,5,6,7,8].map(i=>s('2026-0'+(i%9||1)+'-01',600*45,45,22.5));
 const poor=[1,2,3,4,5].map(i=>s('2026-0'+i+'-02',300*45,45,6.75));
 const r=villaPrice({area:45,landArea:22,dong:[...rich,...poor],since12});
 assert.equal(r.basis,'dong-land');assert.equal(r.confidence,'medium');assert.equal(r.priceManwon,600*45);
 const unknown=villaPrice({area:45,dong:[...rich,...poor],since12});
 assert.equal(unknown.basis,'dong');assert.equal(unknown.confidence,'low');
});
