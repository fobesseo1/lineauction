// Pure decisions for the daily runner, kept separate so they can be unit tested.
export const JOBS = ['onbid', 'court'];
// Scheduled start time per job (KST). A schedule-triggered run before this time exits quietly,
// which lets a logon trigger fire any time without starting a job early.
export const SCHEDULE_HOURS = { onbid: 10, court: 15 };
export const kstMinutes = (now = new Date()) => { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).split(':').map(Number); return h * 60 + m; };
// KST weekdays each job runs on (0 = Sunday). Court listings change on court business days only;
// Onbid runs daily while its detail backlog is being filled.
export const RUN_DAYS = { onbid: [0, 1, 2, 3, 4, 5, 6], court: [1, 2, 3, 4, 5] };
const WEEKDAY = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
export const kstWeekday = (now = new Date()) => WEEKDAY[new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now)];
export const runsOn = (job, now = new Date()) => RUN_DAYS[job].includes(kstWeekday(now));
export const beforeSchedule = (job, now = new Date()) => kstMinutes(now) < SCHEDULE_HOURS[job] * 60;
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
export function onbidMessage({ list, lifecycle, detail, usage }) {
  const parts = [];
  if (list) parts.push(`목록 ${n(list.properties)}개 물건 · 조건 ${n(list.conditions)}건${list.refresh ? ` (신규 ${n(list.added)} · 사라짐 ${n(list.removed)})` : ''}`);
  if (lifecycle) parts.push(`종료 처리 ${n(lifecycle.closed)} · 재확인 필요 ${n(lifecycle.recheck)}${lifecycle.restored ? ` · 재등장 ${n(lifecycle.restored)}` : ''}`);
  if (detail) parts.push(`상세 ${n(detail.processed)} / ${n(detail.total)} · 남음 ${n(detail.remaining)}`);
  if (usage) parts.push(`오늘 API 목록 ${n(usage.list)}/1,000 · 상세 ${n(usage.detail)}/1,000`);
  return parts.join('\n');
}
