import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPhotos } from './photo-plan.mjs';

const now = new Date('2026-10-07T10:00:00Z');
const item = (key, extra = {}) => ({ key, court: '부천지원', caseNumber: '2024타경1', itemNumber: 1,
  assetCategory: 'real-estate', observationStatus: 'observed', detail: {}, page: 3, pageSize: 40,
  auctionDate: '2026-10-08', assets: [{ address: '경기도 부천시' }], ...extra });
const state = items => ({ items: Object.fromEntries(items.map(entry => [entry.key, entry])) });

test('상세 완료 물건의 저장 누락 사진을 독립적으로 재수집한다', () => {
  const result = planPhotos(state([item('a'), item('b'), item('c', { detail: null }), item('d', { observationStatus: 'needs-recheck' }), item('e', { assets: [{ address: '인천광역시' }] })]),
    { now, media: [{ key: 'b' }], batches: [{ recordedAt: '2026-10-07T05:00:00Z', photoChecks: [{ key: 'a', state: 'captured' }] }] });
  assert.equal(result.nextBatch[0].key, 'a');
  assert.equal(result.nextBatch[0].reason, '촬영 확인 후 저장 누락');
  assert.equal(result.alreadySaved, 1); assert.equal(result.awaitingDetail, 1); assert.equal(result.needsRecheck, 1);
});

test('사진 없음은 일주일 후 다시 확인하고 실패는 두 시간 뒤 재시도한다', () => {
  const s = state([item('a'), item('b')]);
  const batches = [{ recordedAt: '2026-10-07T09:00:00Z', photoChecks: [{ key: 'a', state: 'none-visible' }, { key: 'b', state: 'failed' }] }];
  assert.equal(planPhotos(s, { now, batches }).cooldown, 2);
  assert.equal(planPhotos(s, { now: new Date('2026-10-07T12:00:00Z'), batches }).nextBatch[0].key, 'b');
  assert.equal(planPhotos(s, { now: new Date('2026-10-15T10:00:00Z'), batches }).eligible, 2);
});

test('최신 사진 확인을 사용하고 한 법원·페이지의 최대 네 건만 반환한다', () => {
  const s = state(Array.from({ length: 7 }, (_, index) => item(String(index), { page: index === 6 ? 4 : 3 })));
  const batches = [{ recordedAt: '2026-10-07T01:00:00Z', photoChecks: [{ key: '0', state: 'none-visible' }] },
    { recordedAt: '2026-10-07T02:00:00Z', photoChecks: [{ key: '0', state: 'failed' }] }];
  const result = planPhotos(s, { now, batches });
  assert.equal(result.eligible, 7); assert.equal(result.nextBatch.length, 4);
  assert.ok(result.nextBatch.every(job => job.page === 3));
  assert.throws(() => planPhotos(s, { limit: 5 }), /1..4/);
});
