import test from 'node:test';
import assert from 'node:assert/strict';
import {quietTradeFindings,complexFindings,dongFindings,adminCodeFindings,healthMessage} from './region-health-core.mjs';

const gwangjuOld={code:'29',name:'광주광역시',sigungu:{'광주광역시 동구':'29110','광주광역시 광산구':'29200'}};
const gwangjuNew={code:'12',name:'전남광주통합특별시',partial:true,sigungu:{'전남광주통합특별시 동구':'12210','전남광주통합특별시 광산구':'12330'}};
const leaves=r=>Object.entries(r.sigungu).map(([name,code])=>({name,code}));
const official=[
 {code:'12110',name:'전남광주통합특별시 목포시'},{code:'12210',name:'전남광주통합특별시 동구'},{code:'12330',name:'전남광주통합특별시 광산구'},
 {code:'28125',name:'인천광역시 제물포구'},{code:'28720',name:'인천광역시 옹진군'},
];

test('the 2026-11-18 광주 case: old code 29 is reported, the new partial 12 is clean',()=>{
 const f=adminCodeFindings([gwangjuOld],{29:leaves(gwangjuOld)},official);
 assert.deepEqual(f.map(x=>x.kind),['region-code-empty']);
 assert.deepEqual(adminCodeFindings([gwangjuNew],{12:leaves(gwangjuNew)},official),[],'목포 is outside a partial region and not reported');
});

test('reorganised, renamed and new 시군구 are reported for whole regions',()=>{
 const incheon={code:'28',name:'인천광역시',sigungu:{'인천광역시 중구':'28110','인천광역시 옹진군':'28720'}};
 const kinds=adminCodeFindings([incheon],{28:leaves(incheon)},official).map(x=>`${x.kind}:${x.code}`).sort();
 assert.deepEqual(kinds,['leaf-missing:28110','leaf-new:28125']);
 const renamed={code:'28',name:'인천광역시',sigungu:{'인천광역시 제물포구':'28125','인천광역시 옹진군':'28720'}};
 assert.deepEqual(adminCodeFindings([renamed],{28:leaves(renamed)},official.map(o=>o.code==='28720'?{...o,name:'인천광역시 옹진섬군'}:o)).map(x=>x.kind),['leaf-renamed']);
});

test('0 trades is a finding unless the 시군구 is known to be quiet',()=>{
 const ls=[{code:'12330',name:'광산구'},{code:'28720',name:'옹진군'},{code:'11680',name:'강남구'}];
 const loads=[{lawd:'11680',api:'aptSale',total:120},{lawd:'12330',api:'aptSale',total:0},{lawd:'12330',api:'aptRent',total:0},{lawd:'28720',api:'aptSale',total:0}];
 assert.deepEqual(quietTradeFindings(ls,loads,{28720:'섬'}).map(f=>f.code),['12330']);
 assert.equal(quietTradeFindings([{code:'26110',name:'중구'}],[],{})[0].detail,'최근 달 수집 기록 없음');
 assert.deepEqual(quietTradeFindings(ls,[...loads,{lawd:'12330',api:'silvSale',total:5}],{28720:'섬'}).map(f=>f.code),['12330'],'분양권 alone does not count');
});

test('complexes: zero per 시도 and a partial region leaking outside its 시군구',()=>{
 const f=complexFindings([gwangjuNew,{code:'26',name:'부산광역시'}],{'전남광주통합특별시':957,'부산광역시':0},{'전남광주통합특별시':3});
 assert.deepEqual(f.map(x=>`${x.kind}:${x.code}`),['partial-leak:12','no-complexes:26']);
 assert.deepEqual(complexFindings([gwangjuNew],{'전남광주통합특별시':957},{'전남광주통합특별시':0}),[]);
});

test('dongs: a leaf without 법정동 rows is reported',()=>{
 const f=dongFindings([{code:'12210',name:'동구'},{code:'12330',name:'광산구'}],{12210:{'불로동':'1221011600'},12330:{}});
 assert.deepEqual(f.map(x=>x.code),['12330']);
 assert.equal(dongFindings([{code:'1',name:'x'}],undefined).length,1);
});

test('message lists findings and cuts long lists',()=>{
 const many=Array.from({length:35},(_,i)=>({kind:'no-trades',code:String(i),name:`n${i}`,detail:'d'}));
 assert.match(healthMessage(many),/외 5건$/);
 assert.match(healthMessage([{kind:'region-code-empty',code:'29',name:'광주광역시',detail:'x'}]),/시도 코드 비어 있음: 광주광역시 \(29\)/);
});
