// Read-only progress view for the daily jobs (desktop shortcut "선경매 진행 상황 보기").
// It only reads state files; closing the window never affects a running job.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {koreanDay} from './core.mjs';

const readJson=async path=>{try{return JSON.parse(await readFile(path,'utf8'));}catch{return null;}};
const time=v=>v?new Date(v).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul'}):'—';
const when=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const n=v=>Number.isFinite(v)?v.toLocaleString('ko-KR'):'—';
const ago=v=>{if(!v)return '';const m=Math.round((Date.now()-Date.parse(v))/60000);return m<1?' (방금)':` (${m}분 전)`;};
const statusKo={completed:'완료',failed:'실패',skipped:'건너뜀',running:'진행 중',budget_wait:'오늘 한도 소진 · 다음 실행 때 이어받음',list_completed:'완료','pass-finished':'완료','pass-finished-with-errors':'완료(일부 실패)',blocked:'중단'};
const stepKo={'onbid-list':'온비드 목록 다시 훑기','onbid-detail':'온비드 상세 수집','court-list':'법원 목록·사진 갱신','court-pipeline':'DB 반영·국토부 실거래'};

async function render(){
 const day=koreanDay();
 const [current,lastOnbid,lastCourt,health,onbid,detail,budget,court,molit]=await Promise.all(['data/daily/current.json','data/daily/last-onbid.json','data/daily/last-court.json','data/daily/health.json','data/onbid/progress.json','data/onbid/detail-progress.json','data/onbid/budget.json','data/court/standalone/progress.json','data/court/pipeline/molit-request-budget.json'].map(readJson));
 const lines=[`선경매 진행 상황  ·  ${new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}  (5초마다 갱신, 창을 닫아도 수집은 계속됩니다)`,''];
 if(current){
  const done=current.steps.map(s=>s.name);
  const order=current.job==='onbid'?['onbid-list','onbid-detail']:['court-list','court-pipeline'];
  const now=order.find(s=>!done.includes(s));
  lines.push(`▶ 실행 중: ${current.job==='onbid'?'온비드 공매':'법원 경매'} (${current.trigger==='manual'?'수동':'자동'}, ${time(current.startedAt)} 시작)`);
  lines.push(`  지금 단계: ${stepKo[now]??'마무리 중'}  [${order.map(s=>done.includes(s)?'✔':s===now?'…':'·').join(' ')}]`);
  if(current.job==='onbid'&&now==='onbid-list'&&onbid)lines.push(`  목록: 구간 ${n(onbid.partition)}/8 · ${n(onbid.pages)}쪽 · 요청 ${n(onbid.requests)}회 · 마지막 진행 ${time(onbid.updatedAt)}${ago(onbid.updatedAt)}`);
  if(current.job==='onbid'&&now==='onbid-detail'&&detail)lines.push(`  상세: ${n(detail.processed)} / ${n(detail.total)} (남음 ${n(detail.remaining)}) · 지금 ${detail.current??'—'} · 마지막 진행 ${time(detail.updatedAt)}${ago(detail.updatedAt)}`);
  if(current.job==='court'&&now==='court-list'&&court)lines.push(`  법원: ${court.current?.court??'—'} ${court.current?.page?`${court.current.page}쪽`:''} · 확인 ${n(court.attempted)}건 (성공 ${n(court.succeeded)} · 실패 ${n(court.failed)}) · 새 사진 ${n(court.photos)}장 · 건너뜀 ${n(court.skipped)}`);
  if(current.job==='court'&&now==='court-pipeline')lines.push('  DB 반영과 국토부 실거래 조회 중 (보통 수 분)');
 }else lines.push('■ 지금 실행 중인 작업 없음');
 lines.push('');
 const usage=budget?.serviceDays?.[day]??{list:0,detail:0};
 lines.push(`오늘 API 사용량  온비드 목록 ${n(usage.list)}/1,000 · 온비드 상세 ${n(usage.detail)}/1,000 · 국토부 ${n(molit?.day===day?molit.requests:0)}/${n(molit?.limit??10000)}`);
 if(detail)lines.push(`온비드 상세 누적  ${n(detail.processed)} / ${n(detail.total)} 물건 (남음 ${n(detail.remaining)})`);
 lines.push('');
 for(const [label,run,hour] of [['온비드 공매',lastOnbid,'오전 10시'],['법원 경매',lastCourt,'평일 오후 3시']])
  lines.push(`${label} (${hour.startsWith('평일')?hour:`매일 ${hour}`})  최근: ${run?`${statusKo[run.status]??run.status} · ${run.trigger==='manual'?'수동':'자동'} · ${when(run.finishedAt)}`:'기록 없음'}`);
 lines.push('');
 if(health)lines.push(`감시: ${health.ok?'정상':'이상'} (${time(health.checkedAt)} 확인)`,...health.problems.map(p=>`  ! ${p.title}: ${p.message}`));
 return lines.join('\n');
}

if(process.argv.includes('--watch')){
 for(;;){process.stdout.write('\x1Bc'+await render()+'\n');await delay(5000);}
}else console.log(await render());
