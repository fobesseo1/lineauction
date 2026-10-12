import test from 'node:test';
import assert from 'node:assert/strict';
import {unitOf} from './unit.mjs';

test('unitOf reads building 동 and 호, skipping the legal dong',()=>{
 assert.deepEqual(unitOf('서울특별시 구로구 구로동 685-124 중앙구로하이츠아파트 제6동 제15층 제1503호'),{dong:'6',ho:'1503'});
 assert.deepEqual(unitOf('경기도 남양주시 평내동 661 평내호평역대명루첸포레스티움 108동 20층 2005호'),{dong:'108',ho:'2005'});
 assert.deepEqual(unitOf('서울특별시 성북구 정릉동 508-123 4층403호'),{dong:null,ho:'403'});
 assert.deepEqual(unitOf('서울특별시 강서구 화곡동 102-137 더스위트 제3층 제301호'),{dong:null,ho:'301'});
 assert.deepEqual(unitOf('인천광역시 부평구 부흥로294번길 13 비동 5층501호 (부평동,성현드림빌)'),{dong:'비',ho:'501'});
 assert.deepEqual(unitOf('경기도 하남시 위례대로 190 17층1756호 (학암동,위례효성해링턴타워)'),{dong:null,ho:'1756'});
 assert.deepEqual(unitOf('서울특별시 은평구 응암동 197-11 호안빌 제4층 제401호'),{dong:null,ho:'401'});
 assert.deepEqual(unitOf('서울 어딘가 제101동 제지하1층 제B101호'),{dong:'101',ho:'B101'});
 assert.deepEqual(unitOf('경기도 광주시 능평동 166-29'),{dong:null,ho:null});
});
