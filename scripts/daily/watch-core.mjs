import { runsOn } from './core.mjs';
// Pure watchdog rules for the daily jobs. watch.mjs gathers the facts and sends what this returns.
const MIN = 60_000;
export const SCHEDULE = { onbid: { hour: 10, label: '온비드 공매' }, court: { hour: 15, label: '법원 경매' } };
export const STALL_MINUTES = 25;

// Minutes since KST midnight for a Date.
const kstMinutes = now => { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now).split(':').map(Number); return h * 60 + m; };

// Each problem has a stable key so repeats can be throttled (repeatMinutes) and cleared when it ends.
export function evaluate({ now, day, lock, lockAlive, activityAt, history, blockedStreaks = {} }) {
  const problems = [];
  const label = job => SCHEDULE[job]?.label ?? job;
  if (lock && !lockAlive) problems.push({ key: `crashed:${lock.job}:${lock.startedAt}`, repeatMinutes: 30, title: `${label(lock.job)} 비정상 종료`, message: '실행 중에 프로세스가 사라졌습니다. 다음 실행 때 이어서 진행하며, 지금 다시 하려면 바로가기나 설정 화면에서 실행해 주세요.' });
  if (lock && lockAlive && activityAt && now - activityAt > STALL_MINUTES * MIN) {
    const minutes = Math.round((now - activityAt) / MIN);
    problems.push({ key: `stalled:${lock.job}:${lock.startedAt}`, repeatMinutes: 30, title: `${label(lock.job)} 멈춤 의심`, message: `${minutes}분째 진행 기록이 없습니다. 법원·온비드 사이트 응답 지연이거나 수집기가 멈췄을 수 있습니다.` });
  }
  const today = history.filter(run => run.day === day);
  for (const [job, { hour }] of Object.entries(SCHEDULE)) {
    const runs = today.filter(run => run.job === job);
    const running = lock?.job === job;
    if (!running && !runs.length && runsOn(job, new Date(now)) && kstMinutes(now) >= hour * 60 + 30)
      problems.push({ key: `missed:${job}:${day}`, repeatMinutes: 30, title: `${label(job)} 자동 실행 안 됨`, message: `오늘 ${hour}시 실행이 시작되지 않았습니다. 바로가기나 설정 화면에서 직접 실행할 수 있습니다.` });
    const last = runs.filter(run => run.status !== 'skipped').at(-1);
    if (!running && last?.status === 'failed')
      problems.push({ key: `failed:${job}:${last.startedAt ?? last.at}`, repeatMinutes: 180, initialSent: true, title: `${label(job)} 실패 상태`, message: `오늘 실행이 실패로 끝났습니다${last.error ? ` (${last.error})` : ''}. 원인을 확인한 뒤 다시 실행해 주세요.` });
  }
  for (const [service, days] of Object.entries(blockedStreaks))
    if (days >= 3) problems.push({ key: `blocked:${service}:${day}`, repeatMinutes: 24 * 60, title: `${service === 'molit' ? '국토부' : '온비드'} 요청 ${days}일 연속 거부`, message: 'API 키 만료나 이용 한도 문제일 수 있습니다. 공공데이터포털에서 키 상태를 확인해 주세요.' });
  return problems;
}

// Decide which problems to notify now, given when each key was last sent.
export function due(problems, sent, now) {
  return problems.filter(p => {
    const last = sent[p.key];
    if (last === undefined) return !p.initialSent;
    return now - last >= p.repeatMinutes * MIN;
  });
}
