import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ALL_REGIONS,ENABLED_REGIONS,SIDO_NAMES,SIDO_CODES,catalogOf,courtList,geoAreas,inSidoList,sidoPrefixPattern,shortPattern} from './regions.mjs';
import {leafRegions} from './molit/core.mjs';
import {lineOf} from './geo/stations-core.mjs';
import {destinationsFor,DESTINATIONS_BY_AREA} from './geo/commute-core.mjs';

// 2026-11-18: 광역시·세종 6곳 수집 시작 (사이트 공개는 lineestate app.service_regions가 따로 정함).
const CAPITAL=ALL_REGIONS.filter(r=>r.area==='capital');
test('서울·경기·인천 first, then the six 광역시·세종, all on',()=>{
 assert.deepEqual(SIDO_NAMES,['서울특별시','경기도','인천광역시','부산광역시','대구광역시','대전광역시','세종특별자치시','광주광역시','울산광역시']);
 assert.deepEqual(SIDO_CODES,['11','41','28','26','27','30','36','29','31']);
 assert.deepEqual(ALL_REGIONS.filter(r=>!r.enabled).map(r=>r.code),[]);
 assert.deepEqual(CAPITAL.map(r=>r.code),['11','41','28']);
});
test('capital catalog unchanged: 91 names, 83 leaf 시군구, the first 16 courts',()=>{
 const c=catalogOf(CAPITAL);
 assert.equal(Object.keys(c.codes).length,91);
 assert.equal(leafRegions(c.codes).length,83);
 const courts=JSON.parse(readFileSync(new URL('./court/courts.json',import.meta.url),'utf8'));
 assert.deepEqual(courtList(CAPITAL),courts.slice(0,16));
 // Enabled = capital + 41 metro leaves; courts = the 16 capital ones first, then 9 metro courts.
 assert.equal(leafRegions(catalogOf().codes).length,83+41);
 assert.deepEqual(courtList().slice(0,16),courts.slice(0,16));
 assert.equal(courtList().length,25);
});
test('광역시·세종 시군구 codes (행정표준코드)',()=>{
 const n=code=>Object.keys(ALL_REGIONS.find(r=>r.code===code).sigungu).length;
 assert.deepEqual(['26','27','29','30','31','36'].map(n),[16,9,5,5,5,1]);
 for(const r of ALL_REGIONS)for(const code of Object.values(r.sigungu))assert.ok(code.startsWith(r.code),`${code} in ${r.name}`);
 const all=ALL_REGIONS.flatMap(r=>Object.values(r.sigungu));
 assert.equal(new Set(all).size,all.length);
 assert.equal(ALL_REGIONS.find(r=>r.code==='27').sigungu['대구광역시 군위군'],'27720');
});
test('세종 has no 시군구: its 시도 name is its one leaf and addresses still match',()=>{
 const sido=ALL_REGIONS.map(r=>r.name);
 const leaves=leafRegions(catalogOf(ALL_REGIONS).codes,sido);
 assert.equal(leaves.length,83+41);
 assert.deepEqual(leaves.find(r=>r.code==='36110'),{name:'세종특별자치시',code:'36110'});
 assert.ok(inSidoList('세종특별자치시',sido));
 assert.ok(sidoPrefixPattern(sido).test('세종특별자치시 나성동 1'));
 assert.ok(inSidoList('세종특별자치시'),'on since 2026-11-18');
});
test('capital patterns match the old literals; enabled patterns add the metros',()=>{
 assert.equal(String(sidoPrefixPattern(CAPITAL.map(r=>r.name))),String(/^(서울특별시|경기도|인천광역시)\s/));
 assert.equal(String(shortPattern(CAPITAL.map(r=>r.short))),String(/^(서울|경기|인천)(>|$)/));
 assert.ok(sidoPrefixPattern().test('부산광역시 해운대구 우동 1'));
 assert.ok(!sidoPrefixPattern().test('경상북도 의성군 의성읍 1'),'의성지원 covers 경북 too: addresses filter it out');
});
test('OSM areas: capital keeps its old cache names; 광역시 lines carry the city',()=>{
 assert.deepEqual(geoAreas(CAPITAL).map(a=>[a.key,a.tag,a.tiles.map(t=>t.name)]),[['capital','',['1','2','3','4']]]);
 assert.deepEqual(geoAreas().map(a=>a.key),['capital','26','27','30','36','29','31']);
 assert.deepEqual(geoAreas(ALL_REGIONS).map(a=>a.key),['capital','26','27','30','36','29','31']);
 assert.equal(lineOf({ref:'1'}),'1호선');
 assert.equal(lineOf({ref:'1'},'26'),'부산 1호선');
 assert.equal(lineOf({ref:'5'},'26'),null);
 assert.doesNotThrow(()=>destinationsFor(Object.keys(DESTINATIONS_BY_AREA)));
});
test('every enabled region names its courts',()=>{
 for(const r of ENABLED_REGIONS)assert.ok(r.courts.length>0,r.name);
});
