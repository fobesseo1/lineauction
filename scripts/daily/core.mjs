// Pure decisions for the daily runner, kept separate so they can be unit tested.
export const JOBS = ['onbid', 'court'];
export const koreanDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);

// A scheduled run is skipped when the same job already finished today from a manual start.
export function scheduledSkip(history, job, day) {
  const done = history.filter(run => run.job === job && run.day === day && run.status !== 'failed' && run.status !== 'skipped');
  const manual = done.find(run => run.trigger === 'manual');
  if (manual) return { skip: true, reason: 'manual-today', at: manual.finishedAt };
  if (done.some(run => run.trigger === 'schedule')) return { skip: true, reason: 'scheduled-today' };
  return { skip: false };
}

// A lock is live only while its process exists; a crashed run must not block later days.
export function lockState(lock, alive) {
  if (!lock) return 'free';
  return alive(lock.pid) ? 'busy' : 'stale';
}

const n = value => (Number.isFinite(value) ? value.toLocaleString('ko-KR') : '—');
export function onbidMessage({ list, detail, usage }) {
  const parts = [];
  if (list) parts.push(`목록 ${n(list.properties)}개 물건 · 조건 ${n(list.conditions)}건${list.refresh ? ` (신규 ${n(list.added)} · 종료 ${n(list.removed)})` : ''}`);
  if (detail) parts.push(`상세 ${n(detail.processed)} / ${n(detail.total)} · 남음 ${n(detail.remaining)}`);
  if (usage) parts.push(`오늘 API 목록 ${n(usage.list)}/1,000 · 상세 ${n(usage.detail)}/1,000`);
  return parts.join('\n');
}
