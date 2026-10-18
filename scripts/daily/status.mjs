// Read-only progress view for the daily jobs (desktop shortcut "선경매 진행 상황 보기").
// It only reads state files; closing the window never affects a running job.
// Each job's steps are listed with ✔ done / ▶ running / · waiting, how long each took, and an
// estimate of the remaining time from the same job's last run.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {koreanDay,kstWeekday} from './core.mjs';

const readJson=async path=>{try{return JSON.parse(await readFile(path,'utf8'));}catch{return null;}};
const time=v=>v?new Date(v).toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'}):'—';
const when=v=>v?new Date(v).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const n=v=>Number.isFinite(v)?v.toLocaleString('ko-KR'):'—';
const ago=v=>{if(!v)return '';const m=Math.round((Date.now()-Date.parse(v))/60000);return m<1?' (방금)':` (${m}분 전)`;};
const dur=s=>{if(!Number.isFinite(s))return '';const m=Math.round(s/60);return m<1?'1분 미만':m<60?`${m}분`:`${Math.floor(m/60)}시간 ${m%60}분`;};
const statusKo={completed:'완료',failed:'실패',skipped:'건너뜀',running:'진행 중',budget_wait:'오늘 한도 소진 · 다음 실행 때 이어받음',list_completed:'완료','pass-finished':'완료','pass-finished-with-errors':'완료(일부 실패)',blocked:'중단'};
const JOB_KO={onbid:'온비드 공매',court:'법원 경매',market:'단지·실거래'};

// Step order per job (same as run.mjs) with a plain description of what each one does.
const STEPS={
 market:[
  ['complex','단지 정보','K-APT 아파트 단지 목록·세대수·주차 등 (하루 한도까지)'],
  ['molit','국토부 실거래 받기','이번 달·지난달 실거래를 다시 받음 (일요일은 3개월)'],
  ['publish','실거래 올리기','시세 요약·거래 목록을 사이트 DB에 반영'],
  ['conversion-rate','전월세 전환율','시군구별 전환율 계산 (계산기용, 월요일만)'],
  ['r-one','상가 임대동향','한국부동산원 임대료·수익률 (월요일만)'],
  ['commercial-areas','상권 위치','한국부동산원 상권 지점 (월요일만)'],
  ['build-year','준공연도','새 물건 건물의 사용승인 연도 조회'],
  ['official-price','공시가격','물건·단지 공시가격 조회'],
  ['parcel-info','토지·건물 정보','공시지가·용도지역·건물 구조'],
  ['analyze','할인율 계산','물건마다 실거래 대비 할인율·참고 시세'],
  ['sale-signals','매물화 신호','곧 팔릴 물건 점수'],
  ['geo','지도 좌표','새 건물·물건의 지도 위치 (10/21쯤까지는 빌라 2.5만 곳씩이라 1~2시간)'],
  ['stats','지역 통계','통계 페이지 숫자 갱신'],
  ['alerts','알림 발송','조건에 맞는 새 물건을 텔레그램으로'],
 ],
 onbid:[
  ['onbid-list','온비드 목록','수도권 공매 물건 목록 전체 다시 확인'],
  ['onbid-lifecycle','종료 처리','목록에서 사라진 물건 정리'],
  ['onbid-detail','온비드 상세','물건 상세·사진·권리 정보 (하루 1,000건)'],
  ['refresh-current','지금 회차 정리','물건마다 현재 회차만 남기기'],
  ['fill-pnu','주소 → 필지','새 물건의 필지번호·지도 위치'],
  ['alerts','알림 발송','조건에 맞는 새 물건을 텔레그램으로'],
 ],
 court:[
  ['court-list','법원 목록·사진','수도권 법원 경매 목록·상세·사진'],
  ['court-past-results','지난 기일 결과','최근 7일 매각·유찰 결과'],
  ['court-pipeline','DB 반영','사이트 DB 반영·국토부 실거래 연결'],
  ['refresh-current','지금 회차 정리','물건마다 현재 회차만 남기기'],
  ['fill-pnu','주소 → 필지','새 물건의 필지번호·지도 위치'],
  ['alerts','알림 발송','조건에 맞는 새 물건을 텔레그램으로'],
 ],
};
// The Monday-only market steps are hidden on other days.
const stepsFor=(job,now)=>(STEPS[job]??[]).filter(([k])=>!['r-one','commercial-areas','conversion-rate'].includes(k)||(job==='market'&&kstWeekday(now)===1));

function jobLines(current,last,extra){
 const now=new Date();
 const steps=stepsFor(current.job,now);
 const done=new Map(current.steps.map(s=>[s.name,s]));
 // Steps may repeat a name (alerts runs once per job), so the first not-yet-done one is running.
 const running=steps.find(([k])=>!done.has(k))?.[0];
 const typical=new Map((last?.steps??[]).map(s=>[s.name,s.seconds]));
 const lastStepEnd=current.steps.reduce((t,s)=>t+(s.seconds??0),0)*1000+Date.parse(current.startedAt);
 const runningFor=(Date.now()-lastStepEnd)/1000;
 const lines=[`▶ 실행 중: ${JOB_KO[current.job]??current.job} (${current.trigger==='manual'?'수동':'자동'}, ${time(current.startedAt)} 시작 · ${dur((Date.now()-Date.parse(current.startedAt))/1000)}째)`,''];
 let remaining=0,unknown=false;
 steps.forEach(([key,name,what],i)=>{
  const d=done.get(key);
  const mark=d?(d.code===0?'✔':'✖'):key===running?'▶':'·';
  let note;
  if(d)note=d.code===0?`${dur(d.seconds)} 걸림`:`실패 (${String(d.result??'').slice(0,40)})`;
  else if(key===running){
   const t=typical.get(key),left=extra.remaining?.[key];
   note=`진행 중 ${dur(runningFor)}${Number.isFinite(left)?` · 약 ${dur(left)} 남음`:Number.isFinite(t)?` · 보통 ${dur(t)}`:''}`;
   // A step that reports its own progress is estimated from its pace, not from the last run.
   if(Number.isFinite(left))remaining+=left;
   else if(Number.isFinite(t)&&runningFor<=t)remaining+=t-runningFor;
   else{unknown=true;if(Number.isFinite(t))note+=' (보통보다 오래 걸리는 중)';}
  }else{
   const t=typical.get(key);
   note=Number.isFinite(t)?`보통 ${dur(t)}`:'';
   if(Number.isFinite(t))remaining+=t;else unknown=true;
  }
  lines.push(`  ${mark} ${String(i+1).padStart(2)}. ${name.padEnd(10,'　')} ${note}`);
  lines.push(`        ${what}`);
  if(key===running&&extra[key])lines.push(`        → ${extra[key]}`);
 });
 const doneCount=steps.filter(([k])=>done.has(k)).length;
 lines.push('');
 lines.push(unknown
  ?`  진행: ${doneCount} / ${steps.length} 단계 완료 · 지금 단계가 평소보다 길어 끝나는 시각은 계산하지 못함 (나머지 단계는 약 ${dur(remaining)})`
  :`  진행: ${doneCount} / ${steps.length} 단계 완료 · 남은 시간 약 ${dur(remaining)} · 예상 종료 ${time(Date.now()+remaining*1000)}`);
 lines.push('  (예상 시간은 지난번 같은 작업 기준이라 그날 자료 양에 따라 달라집니다)');
 return lines;
}

async function render(){
 const day=koreanDay();
 const [current,lastOnbid,lastCourt,lastMarket,health,onbid,detail,budget,court,molit,coords]=await Promise.all(['data/daily/current.json','data/daily/last-onbid.json','data/daily/last-court.json','data/daily/last-market.json','data/daily/health.json','data/onbid/progress.json','data/onbid/detail-progress.json','data/onbid/budget.json','data/court/standalone/progress.json','data/court/pipeline/molit-request-budget.json','data/geo/coords-progress.json'].map(readJson));
 const lines=[`선경매 진행 상황  ·  ${new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})}  (5초마다 갱신, 창을 닫아도 수집은 계속됩니다)`,''];
 const lock=await readJson('data/daily/running.lock');
 if(current&&lock){
  const extra={
   'onbid-list':onbid&&`구간 ${n(onbid.partition)}/12 · ${n(onbid.pages)}쪽 · 마지막 진행 ${time(onbid.updatedAt)}${ago(onbid.updatedAt)}`,
   'onbid-detail':detail&&`${n(detail.processed)} / ${n(detail.total)} (남음 ${n(detail.remaining)}) · 마지막 진행 ${time(detail.updatedAt)}${ago(detail.updatedAt)}`,
   'court-list':court&&`${court.current?.court??'—'} ${court.current?.page?`${court.current.page}쪽`:''} · 확인 ${n(court.attempted)}건 (실패 ${n(court.failed)}) · 새 사진 ${n(court.photos)}장`,
   geo:coords&&Date.parse(coords.startedAt)>=Date.parse(current.startedAt)&&`필지 ${n(coords.fetched)} / ${n(coords.target)} · 마지막 진행 ${time(coords.updatedAt)}${ago(coords.updatedAt)}`,
   remaining:{},
  };
  // 지도 좌표 reports how many parcels it has fetched, so its remaining time follows its own pace.
  if(extra.geo&&coords.fetched>0){const spent=(Date.parse(coords.updatedAt)-Date.parse(coords.startedAt))/1000;extra.remaining.geo=spent/coords.fetched*Math.max(0,coords.target-coords.fetched);}
  lines.push(...jobLines(current,{onbid:lastOnbid,court:lastCourt,market:lastMarket}[current.job],extra));
 }else lines.push('■ 지금 실행 중인 작업 없음');
 lines.push('');
 lines.push('── 매일 일정 ──');
 for(const [label,run,hour] of [['단지·실거래',lastMarket,'매일 오전 9시'],['온비드 공매',lastOnbid,'매일 오전 10시 (앞 작업이 끝나면 바로)'],['법원 경매',lastCourt,'평일, 온비드 끝나고 3분 뒤 (늦어도 오후 3시)']])
  lines.push(`  ${label.padEnd(6,'　')} ${hour}  ·  최근: ${run?`${statusKo[run.status]??run.status} ${when(run.finishedAt)}`:'기록 없음'}`);
 lines.push('');
 const usage=budget?.serviceDays?.[day]??{list:0,detail:0};
 lines.push(`오늘 API 사용량  온비드 목록 ${n(usage.list)}/1,000 · 온비드 상세 ${n(usage.detail)}/1,000 · 국토부 ${n(molit?.day===day?molit.requests:0)}/${n(molit?.limit??10000)}`);
 if(detail)lines.push(`온비드 상세 누적  ${n(detail.processed)} / ${n(detail.total)} 물건 (남음 ${n(detail.remaining)})`);
 lines.push('');
 if(health)lines.push(`감시: ${health.ok?'정상':'이상'} (${time(health.checkedAt)} 확인)`,...health.problems.map(p=>`  ! ${p.title}: ${p.message}`));
 return lines.join('\n');
}

if(process.argv.includes('--watch')){
 for(;;){process.stdout.write('\x1Bc'+await render()+'\n');await delay(5000);}
}else console.log(await render());
