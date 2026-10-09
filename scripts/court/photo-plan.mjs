import { inSeoulGyeonggi } from './scope.mjs';

// Photos have their own queue: completing a detail job must not hide missing media.
export function planPhotos(state, { media = [], batches = [], now = new Date(), limit = 4, courtCoverage = [] } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 4) throw Error('Photo limit must be 1..4');
  const time = now.getTime();
  if (!Number.isFinite(time)) throw Error('Invalid planning time');
  const photographed = new Set(media.map(entry => entry.key));
  const coverage = new Map(courtCoverage.map(entry => [entry.court, entry]));
  const checks = new Map();
  for (const batch of [...batches].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    for (const check of batch.photoChecks ?? []) checks.set(check.key, { ...check, checkedAt: batch.recordedAt });
  }
  const counts = { pending: 0, alreadySaved: 0, awaitingDetail: 0, needsRecheck: 0, noneVisible: 0, cooldown: 0 };
  const candidates = [];
  for (const item of Object.values(state.items ?? {})) {
    if (item.assetCategory !== 'real-estate' || !inSeoulGyeonggi(item)) continue;
    if (photographed.has(item.key)) { counts.alreadySaved++; continue; }
    if (!item.detail) { counts.awaitingDetail++; continue; }
    if (item.observationStatus !== 'observed') { counts.needsRecheck++; continue; }
    const check = checks.get(item.key);
    // No visible photo is an observation, not a permanent absence. Revisit after a week.
    const retryMs = check?.state === 'none-visible' ? 7 * 86400000 : 2 * 3600000;
    if (check?.state === 'none-visible') counts.noneVisible++;
    counts.pending++;
    if (check && Date.parse(check.checkedAt) + retryMs > time) { counts.cooldown++; continue; }
    candidates.push({ key: item.key, court: item.court, caseNumber: item.caseNumber, itemNumber: item.itemNumber,
      page: item.page, pageSize: item.pageSize ?? coverage.get(item.court)?.pageSize ?? 10,
      reason: check?.state === 'captured' ? '촬영 확인 후 저장 누락' : check?.state === 'failed' ? '사진 수집 재시도' : '대표 사진 미수집',
      auctionDate: item.auctionDate, observedAt: item.lastSeenAt });
  }
  candidates.sort((a, b) => (a.auctionDate ?? '9999').localeCompare(b.auctionDate ?? '9999') || a.key.localeCompare(b.key));
  const first = candidates[0];
  const nextBatch = first ? candidates.filter(job => job.court === first.court && job.page === first.page && job.pageSize === first.pageSize).slice(0, limit) : [];
  return { plannedAt: now.toISOString(), scope: 'seoul-gyeonggi', ...counts, eligible: candidates.length, nextBatch };
}
