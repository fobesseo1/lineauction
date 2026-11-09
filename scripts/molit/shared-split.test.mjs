import test from 'node:test';
import assert from 'node:assert/strict';
import {splitTrades,dongOwners,dongKey,planPlaceSplit,ownerOfName} from './shared-split.mjs';

const none=new Map();
const sale=(key,area,building,name='x')=>({key,deal:'sale',area,building,name});
const rent=(key,area,name='x')=>({key,deal:'rent',area,building:'',name});
const owner=(r,k)=>r.result.get(k).owner;
const method=(r,k)=>r.result.get(k).method;
const c=(kapt_code,name,sale_type='분양',extra={})=>({kapt_code,name,sale_type,...extra});

test('one sale complex takes every sale, the rental complex none',()=>{
 const r=splitTrades([c('R','상계주공15단지','임대'),c('S','상계주공16단지')],[sale('a',59.39,'1615'),rent('b',59.39)],none);
 assert.equal(owner(r,'a'),'S');assert.equal(method(r,'a'),'rental');
 assert.equal(owner(r,'b'),null);
});

test('the filed name decides, and a differing 동 number is only recorded',()=>{
 const cs=[c('1','광장극동1차'),c('2','극동2차아파트')];
 const buildings=new Map([['1',['6동','1동']],['2',['1동']]]);
 const r=splitTrades(cs,[sale('a',84,'6','극동2'),sale('b',126,'2','극동1')],buildings);
 assert.equal(owner(r,'a'),'2');assert.equal(owner(r,'b'),'1');
 assert.deepEqual(r.agree.dongName,{same:0,diff:1});
});

test('동 numbers count only when exactly on one complex list',()=>{
 const cs=[c('6','개포주공6단지'),c('7','개포주공7단지')];
 const buildings=new Map([['6',['607동']],['7',['701동']]]);
 const r=splitTrades(cs,[sale('a',83,'607동','개포주공'),sale('b',83,'701','개포주공'),sale('c',83,'608','개포주공'),sale('d',83,'','개포주공')],buildings);
 assert.equal(owner(r,'a'),'6');assert.equal(method(r,'a'),'dong');assert.equal(owner(r,'b'),'7');
 assert.equal(method(r,'c'),'shared');assert.equal(method(r,'d'),'shared');
});

test('a 동 number on several complex lists decides nothing',()=>{
 assert.equal(dongOwners([c('2','덕유2'),c('4','덕유4')],new Map([['2',['205']],['4',['205']]])).size,0);
});

test('a name part one complex has settles complexes with the same number',()=>{
 const cs=[c('L','화정달빛마을2단지라이프'),c('B','화정달빛마을2단지부영')];
 const r=splitTrades(cs,[sale('a',84,'','달빛(라이프)2'),sale('b',84,'','달빛마을(부영)2')],none);
 assert.equal(owner(r,'a'),'L');assert.equal(owner(r,'b'),'B');
});

test('a name listing several complexes settles nothing',()=>{
 const cs=['태산','대진','정광'].map(n=>c(n,`선학${n}`));
 assert.equal(method(splitTrades(cs,[sale('a',64.38,'','태산,대진.정광아파트')],none),'a'),'shared');
 assert.equal(ownerOfName('양지마을(6단지)(금호,청구)',[c('1','양지마을 금호 1단지'),c('6','양지마을 금호 6단지'),c('C','수내양지마을청구')]),null);
});

test('numbers joined by a comma name one complex',()=>{
 const cs=[c('1','플루리움1단지'),c('2','플루리움2단지'),c('45','플루리움45단지아파트')];
 assert.equal(ownerOfName('플루리움4,5단지',cs),'45');
 assert.equal(ownerOfName('플루리움2단지',cs),'2');
});

test('a name with no number cannot pick one of several numbered complexes',()=>{
 assert.equal(ownerOfName('노원롯데캐슬시그니처',[c('1','노원롯데캐슬시그니처1단지'),c('2','노원롯데캐슬시그니처2단지')]),null);
});

test('rents follow the filed name, a rental name goes to the rental complex',()=>{
 const cs=[c('S','신내9단지'),c('R','신내9단지임대','임대')];
 const r=splitTrades(cs,[rent('a',33,'신내9진흥(임대)'),rent('b',33,'다른이름')],none);
 assert.equal(owner(r,'a'),'R');assert.equal(owner(r,'b'),null);
});

test('sales assigned by 동 that do not fit the complex are held',()=>{
 const cs=[c('A','가','분양',{units_le60:100,units_le85:0,units_le135:0,units_gt135:0}),c('B','나','분양')];
 const buildings=new Map([['A',['101']],['B',['201']]]);
 const trades=Array.from({length:12},(_,i)=>sale(`t${i}`,84,'101','이름없음'));
 const r=splitTrades(cs,trades,buildings);
 assert.equal(method(r,'t0'),'shared');assert.match(r.dropped,/없는 평형대/);
});

test('planPlaceSplit leaves a one-sale-complex building and gives the rental complex its rents',()=>{
 const cs=[c('R','15단지','임대'),c('S','16단지')];
 const p=planPlaceSplit('P',cs,[sale('a',59,'1615'),rent('b',59),rent('c',59,'15단지(임대)')],none);
 assert.equal(p.primary,'S');assert.equal(p.primaryMatch,'shared_sale');assert.equal(p.parentName,'16단지');
 assert.deepEqual(p.rows.map(r=>[r.id,r.place_id]),[['a','P'],['b','P'],['b~R','P:R'],['c','P:R']]);
});

test('planPlaceSplit gives each sale complex its own place and counts the rest in every one of them',()=>{
 const cs=[c('6','개포주공6단지'),c('7','개포주공7단지')];
 const p=planPlaceSplit('P',cs,[sale('a',83,'','개포주공6단지'),sale('b',83,'','개포주공7단지'),sale('c',83,'','개포주공')],none);
 assert.deepEqual(p.rows.map(r=>r.place_id),['P:6','P:7','P','P:6','P:7']);
 assert.deepEqual(p.rows.map(r=>!!r.common),[false,false,true,false,false]);
 assert.deepEqual(p.rows.map(r=>!!r.statOnly),[false,false,false,true,true]);
 assert.equal(p.primaryMatch,'shared_lot');assert.deepEqual(p.alsoLinked,['7']);
});

test('a hand rule places sales by 동 or exact deal and leaves the rest common',()=>{
 const cs=[c('T','선학태산'),c('D','선학대진'),c('J','선학정광')];
 const rule={dong:{1:'T',8:'D',11:'J'},deals:[{date:'2026-10-18',area:64.38,floor:2,amount:19400,owner:'D'}]};
 const t=(key,building,extra={})=>({...sale(key,64.38,building,'태산,대진.정광아파트'),deal_date:'2026-09-01',floor:1,amount:1,...extra});
 const p=planPlaceSplit('P',cs,[t('a','1동'),t('b','11'),t('c','',{deal_date:'2026-10-18',floor:2,amount:19400}),t('d',''),{...rent('e',64.38),deal_date:'2026-09-01'}],none,{override:rule});
 assert.deepEqual(p.rows.filter(r=>!r.statOnly).map(r=>[r.id,r.place_id]),[['a','P:T'],['b','P:J'],['c','P:D'],['d','P'],['e','P']]);
 assert.equal(p.rows.filter(r=>r.statOnly).length,3);
});

test('a hand rule can give every sale to one complex',()=>{
 const cs=[c('6','금호6'),c('1','금호1'),c('C','청구')];
 const p=planPlaceSplit('P',cs,[{...sale('a',55,'601','묶음,신고'),deal_date:'2026-09-01',floor:1,amount:1}],none,{override:{all:'6'}});
 assert.deepEqual(p.rows.map(r=>r.place_id),['P:6']);
});

test('asOne keeps every trade common even when names differ',()=>{
 const cs=[c('1','노원1단지'),c('2','노원2단지')];
 const p=planPlaceSplit('P',cs,[sale('a',84,'','노원1단지')],none,{asOne:true});
 assert.deepEqual(p.rows.map(r=>r.place_id),['P','P:1','P:2']);
 assert.deepEqual(p.children.map(x=>x.kapt_code),['1','2']);
});

test('planPlaceSplit skips a building with no sale complex',()=>{
 assert.equal(planPlaceSplit('P',[c('A','a','임대'),c('B','b','임대')],[],none),null);
});

test('dongKey ignores the 동 suffix',()=>{assert.equal(dongKey(' 101동'),'101');assert.equal(dongKey(''),null);});
