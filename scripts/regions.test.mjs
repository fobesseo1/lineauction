import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ALL_REGIONS,ENABLED_REGIONS,SIDO_NAMES,SIDO_CODES,catalogOf,courtList,geoAreas,inSidoList,sidoPrefixPattern,shortPattern} from './regions.mjs';
import {leafRegions} from './molit/core.mjs';
import {lineOf} from './geo/stations-core.mjs';
import {destinationsFor,DESTINATIONS_BY_AREA} from './geo/commute-core.mjs';

test('only 서울·경기·인천 are on, in that order',()=>{
 assert.deepEqual(SIDO_NAMES,['서울특별시','경기도','인천광역시']);
 assert.deepEqual(SIDO_CODES,['11','41','28']);
 assert.deepEqual(ALL_REGIONS.filter(r=>!r.enabled).map(r=>r.code),['26','27','30','36','29','31']);
});
test('enabled catalog: 91 names, 83 leaf 시군구, the first 16 courts',()=>{
 const c=catalogOf();
 assert.equal(Object.keys(c.codes).length,91);
 assert.equal(leafRegions(c.codes).length,83);
 assert.deepEqual(courtList(),JSON.parse(readFileSync(new URL('./court/courts.json',import.meta.url),'utf8')).slice(0,16));
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
 assert.ok(!inSidoList('세종특별자치시'),'off by default');
});
test('patterns of the enabled regions match the old literals',()=>{
 assert.equal(String(sidoPrefixPattern()),String(/^(서울특별시|경기도|인천광역시)\s/));
 assert.equal(String(shortPattern()),String(/^(서울|경기|인천)(>|$)/));
});
test('OSM areas: capital keeps its old cache names; 광역시 lines carry the city',()=>{
 assert.deepEqual(geoAreas().map(a=>[a.key,a.tag,a.tiles.map(t=>t.name)]),[['capital','',['1','2','3','4']]]);
 assert.deepEqual(geoAreas(ALL_REGIONS).map(a=>a.key),['capital','26','27','30','36','29','31']);
 assert.equal(lineOf({ref:'1'}),'1호선');
 assert.equal(lineOf({ref:'1'},'26'),'부산 1호선');
 assert.equal(lineOf({ref:'5'},'26'),null);
 assert.doesNotThrow(()=>destinationsFor(Object.keys(DESTINATIONS_BY_AREA)));
});
test('every enabled region names its courts',()=>{
 for(const r of ENABLED_REGIONS)assert.ok(r.courts.length>0,r.name);
});
