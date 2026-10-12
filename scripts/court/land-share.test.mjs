import test from 'node:test';
import assert from 'node:assert/strict';
import {landShareM2,courtAssetLand} from './land-share.mjs';

test('landShareM2 reads and sums the 대지권 비율 numerators',()=>{
 assert.equal(landShareM2('대지권의 종류:1. 소유권 |     대지권의 비율:1. 193 분의 32.05'),32.05);
 assert.equal(landShareM2('대지권의 비율:1. 429.2 분의 16.57\n 2. 50 분의 3.1\n\n\n 제시외 1.(면적)8.17㎡'),19.67);
 assert.equal(landShareM2('대지권의 비율:1. 429.2 분의 16.57 |  |  제시외 | 1. 10 분의 9'),16.57);
 assert.equal(landShareM2('대지권 없음'),null);
});

test('courtAssetLand sums lots and counts only the share of a share sale',()=>{
 assert.deepEqual(courtAssetLand([{raw:'서울 구기동 134-8 \n[토지 전 6051㎡ 갑구 53번 김일곤 지분 6051분의 33 전부]'}]),{landArea:33,jimok:'전',share:true});
 assert.deepEqual(courtAssetLand([{raw:'[토지 대 101.7㎡]'},{raw:'[건물 철근콘크리트구조 3층 단독주택]'}]),{landArea:101.7,jimok:'대',share:false});
 assert.deepEqual(courtAssetLand([{raw:'[토지 임야 12298㎡ 갑구 5번 지분 4분의 1 전부]'},{raw:'[토지 임야 1,000㎡]'}]),{landArea:4074.5,jimok:'임야',share:true});
 assert.equal(courtAssetLand([{raw:'[집합건물 철골철근콘크리트조 29.54㎡]'}]),null);
});
