import test from 'node:test';
import assert from 'node:assert/strict';
import { needsRepair, repairAudit } from './repair-audit.mjs';
const item = { key: 'a', court: '서울중앙지방법원', assetCategory: 'real-estate', assets: [{ address: '서울특별시 강남구' }], detail: { raw: 'proof' } };
test('actual media presence determines repair; captured flag alone does not', () => {
  assert.equal(needsRepair(item, { state: 'captured' }, new Set(), '2026-10-08'), true);
  assert.equal(needsRepair(item, null, new Set(['a']), '2026-10-08'), false);
  assert.equal(needsRepair({ ...item, detail: null }, null, new Set(['a']), '2026-10-08'), true);
});
test('same-day no-visible-photo check skips redundant collection, stale check retries', () => {
  const check = { state: 'none-visible', checkedAt: '2026-10-08T01:00:00Z' };
  assert.equal(needsRepair(item, check, new Set(), '2026-10-08'), false);
  assert.equal(needsRepair(item, check, new Set(), '2026-10-09'), true);
});
test('complete traversal preserves missing and absent items without declaring collection complete', () => {
  const state = { items: { a: item, b: { ...item, key: 'b', detail: null } } };
  const audit = repairAudit(state, { courts: [item.court], completedCourts: [item.court], seen: ['a'] });
  assert.equal(audit.allCourtsTraversed, true);
  assert.equal(audit.collectionComplete, false);
  assert.equal(audit.counts.missingDetails, 1);
  assert.equal(audit.counts.missingDetailsSeen, 0);
  assert.equal(audit.absentFromPass[0].key, 'b');
  assert.equal(state.items.b.detail, null);
});
