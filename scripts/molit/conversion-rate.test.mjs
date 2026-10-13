import test from 'node:test';
import assert from 'node:assert/strict';
import {groupRate} from './conversion-rate.mjs';

test('groupRate converts 월세 to a yearly rate against the 전세 gap',()=>{
 const t=[{deal:'rent',deposit:50000,monthly_rent:0},{deal:'rent',deposit:10000,monthly_rent:200}];
 // 200 × 12 ÷ (50000 − 10000) = 6%
 assert.equal(groupRate(t),6);
});

test('groupRate needs both 전세 and 월세 and a real deposit gap',()=>{
 assert.equal(groupRate([{deal:'rent',deposit:50000,monthly_rent:0}]),null);
 assert.equal(groupRate([{deal:'rent',deposit:50000,monthly_rent:0},{deal:'rent',deposit:45000,monthly_rent:30}]),null);
});
