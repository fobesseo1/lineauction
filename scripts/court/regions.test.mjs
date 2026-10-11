import test from 'node:test';
import assert from 'node:assert/strict';
import {regionCode,regionCatalog} from './regions.mjs';
test('official catalog covers all Seoul districts and unambiguous Gyeonggi districts',()=>{
 assert.equal(Object.keys(regionCatalog.codes).filter(n=>n.startsWith('서울특별시 ')).length,25);
 assert.equal(regionCode('서울특별시 송파구'),'11710');
 assert.equal(regionCode('경기도 수원시 영통구'),'41117');
 assert.equal(regionCode('경기도 부천시 원미구'),'41192');
 assert.equal(regionCode('경기도 화성시 동탄구'),'41597');
 assert.equal(regionCode('경기도 파주시'),'41480');
});
test('parent city without a district cannot silently use the wrong code',()=>{
 assert.equal(regionCode('경기도 수원시'),null);
 assert.equal(regionCode('경기도 화성시'),null);
 assert.equal(regionCode('인천광역시'),null);
});
test('Incheon districts use post-2026-07 codes; legacy names map to every successor',()=>{
 assert.equal(regionCode('인천광역시 남동구'),'28200');
 assert.equal(regionCode('인천광역시 검단구'),'28290');
 assert.equal(regionCode('인천광역시 서구'),'28275,28290');
 assert.equal(regionCode('인천광역시 중구'),'28125,28155');
 assert.equal(regionCode('인천광역시 남구'),'28177');
});
