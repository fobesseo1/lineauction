import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ALL_REGIONS,ENABLED_REGIONS,isEnabled,regionDay,catalogOf,courtList,geoAreas,inSidoList,sidoPrefixPattern,shortPattern,inEnabledArea,keepBjd,partialSigunguCodes,currentSidoName} from './regions.mjs';
import {leafRegions} from './molit/core.mjs';
import {lineOf} from './geo/stations-core.mjs';
import {destinationsFor,DESTINATIONS_BY_AREA} from './geo/commute-core.mjs';

// 2026-11-18: 광역시·세종 6곳 수집 시작, 2026-11-20: 경남·경북, 2026-11-21: 남은 도를 날짜로 미리 넣음
// (충남·충북 11-22, 전북·강원 11-23, 제주 11-24). 사이트 공개는 lineestate app.service_regions가 따로 정한다.
// Tests name the day they look at, so they keep passing after each booked day.
const CAPITAL=ALL_REGIONS.filter(r=>r.area==='capital');
const on=day=>ALL_REGIONS.filter(r=>isEnabled(r,day));
const codes=day=>on(day).map(r=>r.code);
test('서울·경기·인천 first, then the six 광역시·세종, then 경남·경북; the other 도 switch on by date',()=>{
 assert.deepEqual(on('2026-11-21').map(r=>r.name),['서울특별시','경기도','인천광역시','부산광역시','대구광역시','대전광역시','세종특별자치시','전남광주통합특별시','울산광역시','경상남도','경상북도']);
 assert.deepEqual(codes('2026-11-21'),['11','41','28','26','27','30','36','12','31','48','47']);
 assert.deepEqual(codes('2026-11-22'),[...codes('2026-11-21'),'44','43']);
 assert.deepEqual(codes('2026-11-23'),[...codes('2026-11-22'),'52','51']);
 assert.deepEqual(codes('2026-11-24'),[...codes('2026-11-23'),'50']);
 assert.deepEqual(codes('2027-01-01'),ALL_REGIONS.map(r=>r.code),'every listed region is on or booked');
 assert.deepEqual(ENABLED_REGIONS,on(regionDay()));
 assert.deepEqual(CAPITAL.map(r=>r.code),['11','41','28']);
});
test('isEnabled: "enabled": true, or from "enabledFrom" (KST day) on',()=>{
 assert.ok(isEnabled({enabled:true},'2000-01-01'));
 assert.ok(!isEnabled({enabled:false},'2099-01-01'));
 assert.ok(!isEnabled({},'2099-01-01'));
 assert.ok(!isEnabled({enabledFrom:'2026-11-22'},'2026-11-21'));
 assert.ok(isEnabled({enabledFrom:'2026-11-22'},'2026-11-22'));
 assert.throws(()=>isEnabled({code:'x',enabledFrom:'2026-11-2'},'2026-11-22'),/BAD_ENABLED_FROM/);
 // 2026-11-21 15:00Z is already 11-22 in Korea: the 07:00 KST run sees the new day.
 const saved=process.env.REGIONS_DAY;delete process.env.REGIONS_DAY;
 try{
  assert.equal(regionDay(new Date('2026-11-21T14:59:00Z')),'2026-11-21');
  assert.equal(regionDay(new Date('2026-11-21T15:00:00Z')),'2026-11-22');
  process.env.REGIONS_DAY='2026-11-24';assert.equal(regionDay(),'2026-11-24');
  process.env.REGIONS_DAY='11-24';assert.throws(()=>regionDay(),/BAD_REGIONS_DAY/);
 }finally{if(saved==null)delete process.env.REGIONS_DAY;else process.env.REGIONS_DAY=saved;}
});
test('capital catalog unchanged: 91 names, 83 leaf 시군구, the first 16 courts',()=>{
 const c=catalogOf(CAPITAL);
 assert.equal(Object.keys(c.codes).length,91);
 assert.equal(leafRegions(c.codes).length,83);
 const courts=JSON.parse(readFileSync(new URL('./court/courts.json',import.meta.url),'utf8'));
 assert.deepEqual(courtList(CAPITAL),courts.slice(0,16));
 // 11-21 = capital + 41 metro + 22 전남 (added to 12 on 11-26) + 45 경남·경북 leaves; courts = the 16 capital ones first, then 9 metro + 4 전남 and 12 경남·경북 courts.
 assert.equal(leafRegions(catalogOf(on('2026-11-21')).codes,on('2026-11-21').map(r=>r.name)).length,83+41+22+45);
 assert.deepEqual(courtList(on('2026-11-21')).slice(0,16),courts.slice(0,16));
 assert.equal(courtList(on('2026-11-21')).length,41);
 // + 충남 16·충북 14 (courts 5+4), + 전북 15·강원 18 (4+5), + 제주 2 (1)
 assert.deepEqual(['2026-11-22','2026-11-23','2026-11-24'].map(d=>[leafRegions(catalogOf(on(d)).codes,on(d).map(r=>r.name)).length,courtList(on(d)).length]),[[221,50],[254,59],[256,60]]);
});
test('광역시·세종 시군구 codes (행정표준코드)',()=>{
 const n=code=>Object.keys(ALL_REGIONS.find(r=>r.code===code).sigungu).length;
 assert.deepEqual(['26','27','12','30','31','36'].map(n),[16,9,27,5,5,1]);
 for(const r of ALL_REGIONS)for(const code of Object.values(r.sigungu))assert.ok(code.startsWith(r.code),`${code} in ${r.name}`);
 const all=ALL_REGIONS.flatMap(r=>Object.values(r.sigungu));
 assert.equal(new Set(all).size,all.length);
 assert.equal(ALL_REGIONS.find(r=>r.code==='27').sigungu['대구광역시 군위군'],'27720');
});
test('세종 has no 시군구: its 시도 name is its one leaf and addresses still match',()=>{
 const sido=ALL_REGIONS.map(r=>r.name);
 const leaves=leafRegions(catalogOf(ALL_REGIONS).codes,sido);
 assert.equal(leaves.length,83+41+22+45+16+14+15+18+2);
 assert.deepEqual(leaves.find(r=>r.code==='36110'),{name:'세종특별자치시',code:'36110'});
 assert.ok(inSidoList('세종특별자치시',sido));
 assert.ok(sidoPrefixPattern(sido).test('세종특별자치시 나성동 1'));
 assert.ok(inSidoList('세종특별자치시'),'on since 2026-11-18');
});
test('capital patterns match the old literals; enabled patterns add the metros',()=>{
 assert.equal(String(sidoPrefixPattern(CAPITAL.map(r=>r.name))),String(/^(서울특별시|경기도|인천광역시)\s/));
 assert.equal(String(shortPattern(CAPITAL.map(r=>r.short))),String(/^(서울|경기|인천)(>|$)/));
 assert.ok(sidoPrefixPattern().test('부산광역시 해운대구 우동 1'));
 assert.ok(sidoPrefixPattern().test('경상북도 의성군 의성읍 1'),'경북 on since 2026-11-20');
 assert.ok(!sidoPrefixPattern().test('전라남도 여수시 1'),'old 전남 name: off');
 const names=day=>on(day).map(r=>r.name);
 assert.ok(!sidoPrefixPattern(names('2026-11-21')).test('충청북도 청주시 상당구 1'),'충북 off until 11-22');
 assert.ok(sidoPrefixPattern(names('2026-11-22')).test('충청북도 청주시 상당구 1'),'충북 on from 11-22');
 assert.ok(sidoPrefixPattern(names('2026-11-24')).test('제주특별자치도 제주시 연동 1'),'제주 on from 11-24');
});
test('OSM areas: capital keeps its old cache names; 광역시 lines carry the city',()=>{
 assert.deepEqual(geoAreas(CAPITAL).map(a=>[a.key,a.tag,a.tiles.map(t=>t.name)]),[['capital','',['1','2','3','4']]]);
 assert.deepEqual(geoAreas(on('2026-11-21')).map(a=>a.key),['capital','26','27','30','36','29','31','48','47']);
 assert.deepEqual(geoAreas(ALL_REGIONS).map(a=>a.key),['capital','26','27','30','36','29','31','48','47','44','43','52','51','50']);
 for(const a of geoAreas(ALL_REGIONS))assert.doesNotThrow(()=>lineOf({ref:'1'},a.key),a.key);
 assert.equal(lineOf({ref:'1'}),'1호선');
 assert.equal(lineOf({ref:'1'},'26'),'부산 1호선');
 assert.equal(lineOf({ref:'5'},'26'),null);
 assert.doesNotThrow(()=>destinationsFor(Object.keys(DESTINATIONS_BY_AREA)));
});
test('every enabled or booked region names its courts',()=>{
 for(const r of ALL_REGIONS)assert.ok(r.courts.length>0,r.name);
});

test('전남광주통합특별시 (2026-07-01) is collected whole since 2026-11-26: 광주 5개 구 + 옛 전남 22 시·군',()=>{
 const g=ALL_REGIONS.find(r=>r.code==='12');
 assert.equal(g.partial,undefined);
 assert.equal(Object.keys(g.sigungu).length,27);
 assert.equal(g.sigungu['전남광주통합특별시 목포시'],'12110');
 assert.equal(g.sigungu['전남광주통합특별시 신안군'],'12870');
 assert.ok(!ALL_REGIONS.some(r=>r.code==='29'||r.code==='46'),'old 광주 29 / 전남 46 codes return nothing from MOLIT/K-APT since the merger');
 // addresses: new and both old 시도 names
 for(const a of ['전남광주통합특별시 광산구 수완동 1','광주광역시 북구 운암동 2','전남광주통합특별시 목포시 용당동 1','전남광주통합특별시 나주시 빛가람동 1','전라남도 여수시 1'])assert.ok(inEnabledArea(a),a);
 assert.equal(currentSidoName('전라남도'),'전남광주통합특별시');
 // 경기도 광주시 is 경기 (a whole region), not 전남광주
 assert.ok(inEnabledArea('경기도 광주시 오포읍 1'));
 assert.ok(!inEnabledArea('경기도광주시 1'));
 // K-APT list: no bjdCode filter any more
 assert.ok(keepBjd('12','1233010100'));
 assert.ok(keepBjd('12','1211010100'),'목포');
 assert.ok(keepBjd('26','2611010100'),'whole regions are not filtered');
 assert.ok(keepBjd('11',null),'capital rows are never filtered');
 assert.deepEqual(Object.keys(partialSigunguCodes()),[]);
});
test('inEnabledArea matches the old capital prefix rule for whole regions',()=>{
 const cap=sidoPrefixPattern(['서울특별시','경기도','인천광역시']);
 for(const a of ['서울특별시 강남구 1','경기도 수원시 1','인천광역시 서해구 1','서울특별시강남구','부산광역시 해운대구 1','충청남도 천안시 1'])
  assert.equal(inEnabledArea(a,ALL_REGIONS.filter(r=>r.area==='capital')),cap.test(a),a);
});
