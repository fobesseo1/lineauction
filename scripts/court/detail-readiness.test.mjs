import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForCourtDetail} from './detail-readiness.mjs';

function source(frames) {
  let reads=0, waits=0;
  const locator={filter(){return this;},async evaluateAll(){return frames[Math.min(reads++,frames.length-1)];}};
  return {tab:{playwright:{getByRole(){return locator;},async waitForTimeout(ms){assert.equal(ms,500);waits++;}},async getAXState(){}},stats:()=>({reads,waits})};
}
test('waits for values after an initially empty detail frame', async()=>{
  const s=source(['목록 2025타경945','사건번호 물건번호 물건종류','사건번호 2025타경945전자 물건번호 3 물건종류 아파트']);
  assert.match(await waitForCourtDetail(s.tab,{caseNumber:'2025타경945',itemNumber:3}),/아파트/);
  assert.deepEqual(s.stats(),{reads:3,waits:2});
});
test('does not accept another item from the same case',async()=>{
  const s=source(['사건번호 2025타경945전자 물건번호 1 물건종류 아파트']);
  await assert.rejects(waitForCourtDetail(s.tab,{caseNumber:'2025타경945',itemNumber:3,polls:3}),/did not load/);
  assert.deepEqual(s.stats(),{reads:3,waits:2});
});
test('returns an already loaded identity without a delay',async()=>{
  const s=source(['사건번호 2025타경945전자 물건번호 3 물건종류 아파트']);
  await waitForCourtDetail(s.tab,{caseNumber:'2025타경945',itemNumber:3});
  assert.deepEqual(s.stats(),{reads:1,waits:0});
});
test('a longer case number cannot satisfy a shorter requested number',async()=>{
  const s=source(['사건번호 2025타경945전자 물건번호 3 물건종류 아파트']);
  await assert.rejects(waitForCourtDetail(s.tab,{caseNumber:'2025타경94',itemNumber:3,polls:1}),/did not load/);
});
