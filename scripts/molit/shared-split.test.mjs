import test from 'node:test';
import assert from 'node:assert/strict';
import {splitTrades,dongOwners,dongKey,planPlaceSplit} from './shared-split.mjs';

const none=new Map();
const sale=(key,area,building,name='x')=>({key,deal:'sale',area,building,name});
const owner=(r,k)=>r.result.get(k).owner;
const method=(r,k)=>r.result.get(k).method;

test('one sale complex takes every sale, the rental complex none',()=>{
 const r=splitTrades([{kapt_code:'R',name:'상계주공15단지',sale_type:'임대'},{kapt_code:'S',name:'상계주공16단지',sale_type:'분양'}],[sale('a',59.39,'1615'),{key:'b',deal:'rent',area:59.39,name:'x'}],none,none);
 assert.equal(owner(r,'a'),'S');assert.equal(method(r,'a'),'rental');
 assert.equal(owner(r,'b'),null);
});

test('단지 numbers in the names split by 동',()=>{
 const cs=[{kapt_code:'6',name:'개포주공6단지',sale_type:'분양'},{kapt_code:'7',name:'개포주공7단지',sale_type:'분양'}];
 const r=splitTrades(cs,[sale('a',83.21,'607동'),sale('b',83.7,'701동'),sale('c',83.7,'')],none,none);
 assert.equal(owner(r,'a'),'6');assert.equal(owner(r,'b'),'7');assert.equal(method(r,'c'),'shared');
});

test('a 동 map is not used when one complex would get no 동',()=>{
 const owners=dongOwners([{kapt_code:'2',name:'덕유마을주공2단지'},{kapt_code:'4',name:'덕유마을주공4단지'}],none,new Set(['205','206']));
 assert.equal(owners.size,0);
});

test('area and then name settle what 동 cannot',()=>{
 const cs=[{kapt_code:'A',name:'달빛2단지라이프',sale_type:'분양'},{kapt_code:'B',name:'달빛2단지부영',sale_type:'분양'}];
 const types=new Map([['A',[49.95]],['B',[50]]]);
 const r=splitTrades(cs,[sale('a',49.95,''),sale('b',50,''),sale('c',84,'','달빛2단지부영')],none,types);
 assert.equal(owner(r,'a'),'A');assert.equal(owner(r,'b'),'B');assert.equal(owner(r,'c'),'B');assert.equal(method(r,'c'),'name');
});

test('a name part one complex has settles complexes with the same number',()=>{
 const cs=[{kapt_code:'L',name:'화정달빛마을2단지라이프',sale_type:'분양'},{kapt_code:'B',name:'화정달빛마을2단지부영',sale_type:'분양'}];
 const r=splitTrades(cs,[sale('a',84,'','달빛(라이프)2'),sale('b',84,'','달빛마을(부영)2')],none,none);
 assert.equal(owner(r,'a'),'L');assert.equal(owner(r,'b'),'B');
});

test('a combined name stays shared',()=>{
 const cs=['태산','대진','정광'].map(n=>({kapt_code:n,name:`선학${n}`,sale_type:'분양'}));
 const r=splitTrades(cs,[sale('a',64.38,'','태산,대진.정광아파트')],none,none);
 assert.equal(method(r,'a'),'shared');
});

test('dongKey ignores the 동 suffix',()=>{assert.equal(dongKey(' 101동'),'101');assert.equal(dongKey(''),null);});

const rent=(key,area)=>({key,deal:'rent',area,building:'',name:'x'});
test('planPlaceSplit leaves a one-sale-complex building and copies rents for the rental complex',()=>{
 const cs=[{kapt_code:'R',name:'15단지',sale_type:'임대'},{kapt_code:'S',name:'16단지',sale_type:'분양'}];
 const p=planPlaceSplit('P',cs,[sale('a',59,'1615'),rent('b',59)],none,none);
 assert.equal(p.primary,'S');assert.equal(p.primaryMatch,'shared_sale');assert.deepEqual(p.alsoLinked,[]);
 assert.deepEqual(p.rows.map(r=>[r.id,r.place_id]),[['a','P'],['b','P'],['b~R','P:R']]);
 assert.deepEqual(p.children,[{kapt_code:'R',name:'15단지'}]);
});
test('planPlaceSplit gives each sale complex its own place and keeps the rest on the building',()=>{
 const cs=[{kapt_code:'6',name:'개포주공6단지',sale_type:'분양'},{kapt_code:'7',name:'개포주공7단지',sale_type:'분양'}];
 const p=planPlaceSplit('P',cs,[sale('a',83,'607'),sale('b',83,'701'),sale('c',83,'')],none,none);
 assert.deepEqual(p.rows.map(r=>r.place_id),['P:6','P:7','P']);
 assert.equal(p.primaryMatch,'shared_lot');assert.deepEqual(p.alsoLinked,['7']);
});
test('an unassigned sale among several sale complexes is held, an assigned one is not',()=>{
 const cs=[{kapt_code:'6',name:'개포주공6단지',sale_type:'분양'},{kapt_code:'7',name:'개포주공7단지',sale_type:'분양'}];
 const p=planPlaceSplit('P',cs,[sale('a',83,'607'),sale('b',83,'701'),sale('c',83,'')],none,none);
 assert.deepEqual(p.rows.map(r=>!!r.held),[false,false,true]);
});

test('a split that leaves one complex with nothing is not applied',()=>{
 const cs=[{kapt_code:'A',name:'양지마을 금호 1단지',sale_type:'분양'},{kapt_code:'B',name:'수내양지마을청구',sale_type:'분양'}];
 const trades=Array.from({length:12},(_,i)=>sale(`t${i}`,59,'','양지마을(금호,청구)'));
 const r=splitTrades(cs,trades,none,none);
 assert.equal(method(r,'t0'),'shared');assert.match(r.dropped,/배정된 매매 없음/);
});

test('a split giving a complex sizes it does not have is not applied',()=>{
 const cs=[{kapt_code:'A',name:'가단지1단지',sale_type:'분양',units_le60:100,units_le85:0,units_le135:0,units_gt135:0},{kapt_code:'B',name:'나단지2단지',sale_type:'분양',units_le60:0,units_le85:100,units_le135:0,units_gt135:0}];
 const trades=[...Array.from({length:6},(_,i)=>sale(`a${i}`,84,'101')),...Array.from({length:6},(_,i)=>sale(`b${i}`,84,'201'))];
 const r=splitTrades(cs,trades,none,none);
 assert.match(r.dropped,/없는 평형대/);
});

test('planPlaceSplit skips a building with no sale complex',()=>{
 assert.equal(planPlaceSplit('P',[{kapt_code:'A',sale_type:'임대'},{kapt_code:'B',sale_type:'임대'}],[],none,none),null);
});
