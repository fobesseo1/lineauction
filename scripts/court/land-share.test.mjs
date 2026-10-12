import test from 'node:test';
import assert from 'node:assert/strict';
import {landShareM2} from './land-share.mjs';

test('landShareM2 reads and sums the 대지권 비율 numerators',()=>{
 assert.equal(landShareM2('대지권의 종류:1. 소유권 |     대지권의 비율:1. 193 분의 32.05'),32.05);
 assert.equal(landShareM2('대지권의 비율:1. 429.2 분의 16.57\n 2. 50 분의 3.1\n\n\n 제시외 1.(면적)8.17㎡'),19.67);
 assert.equal(landShareM2('대지권의 비율:1. 429.2 분의 16.57 |  |  제시외 | 1. 10 분의 9'),16.57);
 assert.equal(landShareM2('대지권 없음'),null);
});
