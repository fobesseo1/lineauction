import { inSeoulGyeonggi } from './scope.mjs';

export function needsRepair(item, check, photographed, day) {
  if (!item?.detail) return true;
  if (photographed.has(item.key)) return false;
  return !(check?.state === 'none-visible' && check.checkedAt?.slice(0, 10) === day);
}

// Daily refresh rule: new items always; 5+ photos never again; 0 photos or a disabled/missing
// official detail weekly; 1-4 photos monthly (official photo sets rarely change). Each key gets a
// stable offset inside its period so a bulk pass does not come due on a single day.
const spread = (key, days) => { let h = 0; for (const c of String(key)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % days; };
export function needsDailyRepair(item, check, photoCount, now = Date.now(), { weekly = 7, monthly = 30 } = {}) {
  const last = Date.parse(check?.checkedAt ?? "");
  const due = days => !Number.isFinite(last) || now - last >= (days + spread(item?.key, days)) * 86400000;
  if (!item?.detail) return ["detail-disabled", "property-not-provided"].includes(check?.state) ? due(weekly) : true;
  const count = photoCount ?? 0;
  if (count >= 5) return false;
  return due(count === 0 ? weekly : monthly);
}

// Absence from a traversal is a search task, never proof of sale or withdrawal.
export function repairAudit(state, { media = [], checks = {}, seen = [], courts = [], completedCourts = [], run, startedAt, finishedAt } = {}) {
  const scope = new Set(courts), observed = new Set(seen), photographed = new Set(media.map(x => x.key));
  const items = Object.values(state.items ?? {}).filter(x => scope.has(x.court) && x.assetCategory === 'real-estate' && inSeoulGyeonggi(x));
  const rows = items.map(x => ({ key: x.key, court: x.court, caseNumber: x.caseNumber, itemNumber: x.itemNumber,
    observedThisPass: observed.has(x.key), hasDetail: !!x.detail, hasPhoto: photographed.has(x.key),
    photoCheck: checks[x.key]?.state ?? 'unchecked', lastSeenAt: x.lastSeenAt, observationStatus: x.observationStatus }));
  const missingDetails = rows.filter(x => !x.hasDetail);
  const missingPhotos = rows.filter(x => x.hasDetail && !x.hasPhoto);
  const absent = rows.filter(x => !x.observedThisPass);
  return { run, startedAt, finishedAt, scope: 'seoul-gyeonggi', allCourtsTraversed: courts.length > 0 && courts.every(c => completedCourts.includes(c)),
    counts: { total: rows.length, observedThisPass: rows.length - absent.length, details: rows.length - missingDetails.length,
      photoProperties: rows.filter(x => x.hasPhoto).length, missingDetails: missingDetails.length,
      missingDetailsSeen: missingDetails.filter(x => x.observedThisPass).length, absentFromPass: absent.length },
    collectionComplete: false, reason: '순회 완료와 자료 확보 완료는 별개입니다. 미관측 물건의 종료 상태를 추정하지 않습니다.',
    missingDetails, missingPhotos, absentFromPass: absent };
}
