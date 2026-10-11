import test from 'node:test';
import assert from 'node:assert/strict';
import {riskFlags} from './property-risk.mjs';

test('court notes raise the matching flags in a fixed order',()=>{
 assert.deepEqual(riskFlags('일괄매각, 지분매각. 공유자 우선매수는 1회에 한함. 유치권 신고 있음'),['지분매각','유치권']);
 assert.deepEqual(riskFlags('대항력 있는 임차인 있음, 대지권 미등기, 토지별도등기 있음'),['대지권미등기','토지별도등기','선순위']);
 assert.deepEqual(riskFlags('법정지상권 성립 여지 있음','본건 위반건축물로 등재'),['법정지상권','위반건축물']);
});

test('plain notes and unrelated 지분 mentions raise nothing',()=>{
 assert.deepEqual(riskFlags('-맹지임\n-농지취득자격증명 제출 요함'),[]);
 assert.deepEqual(riskFlags('대지지분 30.5㎡'),[]);
 assert.deepEqual(riskFlags(null,undefined,''),[]);
});
