// Pure planner: only observed real estate; bounded retries and explicit missing data.
import { inSeoulGyeonggi } from './scope.mjs';
export function planDetails(state, { now = new Date(), limit = 4, scope = 'seoul-gyeonggi', courtCoverage = [] } = {}) {
  if (!['seoul-gyeonggi','all'].includes(scope)) throw Error('Unknown collection scope');
  if (!Number.isInteger(limit) || limit < 1 || limit > 4) throw Error('Detail limit must be 1..4');
  const time = now.getTime();
  if (!Number.isFinite(time)) throw Error('Invalid planning time');
  const coverage = new Map(courtCoverage.map(c => [c.court,c]));
  const candidates = [], counts = { pending: 0, cooldown: 0, needsRecheck: 0, ineligible: 0, outsideScope: 0 };
  for (const job of Object.values(state.detailQueue ?? {})) {
    const item = state.items[job.key];
    if (!item || item.assetCategory !== 'real-estate' || item.detail) { counts.ineligible++; continue; }
    if (scope === 'seoul-gyeonggi' && !inSeoulGyeonggi(item)) { counts.outsideScope++; continue; }
    if (item.observationStatus !== 'observed') { counts.needsRecheck++; continue; }
    counts.pending++;
    const attempts = Math.max(0, job.attempts ?? 0);
    const retryAfter = job.lastAttemptAt && attempts ? Date.parse(job.lastAttemptAt) + Math.min(24, 2 ** Math.min(attempts, 5)) * 3600000 : 0;
    if (retryAfter > time) { counts.cooldown++; continue; }
    const auctionTime = Date.parse(`${item.auctionDate}T00:00:00+09:00`);
    const days = (auctionTime - time) / 86400000;
    const upcoming = days >= -1 && days <= 30;
    candidates.push({ key: item.key, court: item.court, caseNumber: item.caseNumber, itemNumber: item.itemNumber,
      page: item.page, pageSize: item.pageSize ?? coverage.get(item.court)?.pageSize ?? job.pageSize ?? 10, attempts,
      auctionDate: item.auctionDate, use: item.use,
      priority: upcoming && item.use === '아파트' ? 0 : upcoming ? 1 : item.use === '아파트' ? 2 : 3,
      reason: upcoming ? '30일 내 입찰 · 상세 미수집' : '상세 미수집', observedAt: item.lastSeenAt });
  }
  candidates.sort((a,b) => a.priority-b.priority || a.attempts-b.attempts ||
    (a.auctionDate ?? '9999').localeCompare(b.auctionDate ?? '9999') || a.key.localeCompare(b.key));
  const first = candidates[0];
  // One page per call prevents large navigation loops and partial identity guesses.
  const nextBatch = first ? candidates.filter(j => j.court === first.court && j.page === first.page && j.pageSize === first.pageSize).slice(0,limit) : [];
  return { plannedAt: now.toISOString(), scope, ...counts, eligible: candidates.length, nextBatch };
}
