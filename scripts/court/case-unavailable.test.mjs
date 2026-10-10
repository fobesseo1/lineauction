import test from 'node:test';
import assert from 'node:assert/strict';
import {unavailableCaseEvidence} from './case-unavailable.mjs';
const item={court:'서울남부지방법원',caseNumber:'2025타경13580',itemNumber:1};
const observed={queryRaw:'법원 :서울남부지방법원\n사건번호 :2025타경13580',body:'해당 사건번호는 잘못된 번호입니다.',sourceUrl:'https://www.courtauction.go.kr/pgj/index.on',observedAt:'2026-10-09T20:00:50Z'};
test('official negative response records unavailability without closure',()=>{const e=unavailableCaseEvidence(item,observed);assert.equal(e.propertyFound,false);assert.equal(e.itemClosureConfirmed,false);assert.equal(e.caseOutcome,null);assert.equal(e.unavailableReason,'official-case-number-not-provided');});
test('negative response for another case or court is rejected',()=>{assert.throws(()=>unavailableCaseEvidence({...item,caseNumber:'2025타경999'},observed),/identity/);assert.throws(()=>unavailableCaseEvidence({...item,court:'서울북부지방법원'},observed),/identity/);});
test('normal or access-control content is not classified as case unavailability',()=>{assert.equal(unavailableCaseEvidence(item,{...observed,body:'접속이 차단되었습니다.'}),null);assert.equal(unavailableCaseEvidence(item,{...observed,body:'사건번호 2025타경13580'}),null);});
