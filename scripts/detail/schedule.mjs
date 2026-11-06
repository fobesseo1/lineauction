// Runs whichever complex-detail collectors are due today (KST). Its own morning task at 07:00, stopping by 07:30, the
// earliest the market job may start. What finishes here therefore reaches the market job's complex-briefs step the
// same morning, and the job's bundle download never lands on files a collector is writing. Quick steps come first and
// fees takes what is left; each collector resumes from its own cache, so a cut-short day continues the next morning.
// A monthly or quarterly step whose day was missed (PC off) waits for its next date.
//   node scripts/detail/schedule.mjs [--dry-run] [--any-time]
import {spawnSync} from 'node:child_process';
const CUTOFF='07:30',cutoffMinutes=7*60+30;
const kst=new Date(Date.now()+9*3600e3),date=kst.getUTCDate(),weekday=kst.getUTCDay(),month=kst.getUTCMonth()+1;
const minutes=()=>{const t=new Date(Date.now()+9*3600e3);return t.getUTCHours()*60+t.getUTCMinutes();};
const anyTime=process.argv.includes('--any-time'),dry=process.argv.includes('--dry-run');
// A late start (woken at noon, say) must not overlap the market job. --until would also roll over to tomorrow's 07:30.
if(!anyTime&&minutes()>=cutoffMinutes){console.log(`PAST_${CUTOFF}`);process.exit(0);}
const busRefresh=date===7&&[1,4,7,10].includes(month);
const STEPS=[
 // 전월세 신고가 매일 들어오지만 만기 분포는 천천히 바뀐다.
 {name:'rent-expiries',when:weekday===1,args:['scripts/detail/rent-expiries.mjs']},
 {name:'childcare',when:date===5,args:['scripts/detail/childcare.mjs']},
 // 공시는 5월·9월 전후로 바뀐다.
 {name:'schools',when:date===8&&[6,10].includes(month),args:['scripts/detail/schools.mjs']},
 // 분기마다: TAGO 파일은 연 1회, 서울 파일은 월 1회 갱신되고 광역 노선은 드물게 바뀐다.
 {name:'bus',when:busRefresh,args:['scripts/detail/bus.mjs','--refresh']},
 // 서울 정류소별 노선은 하루 약 1,000건 한도라 날마다 이어 받는다. 다 받으면 아무것도 쓰지 않는다.
 {name:'bus-seoul',when:!busRefresh,args:['scripts/detail/bus.mjs','--if-new']},
 // 새 단지만 부른다 (필지별 캐시).
 {name:'buildings',when:date===6,args:['scripts/detail/buildings.mjs','--phase','titles','--until',CUTOFF]},
 // 하루 30분이면 약 1,200곳이라 한 달 치가 9일쯤 걸린다. 날짜를 가리지 않고 받을 게 있으면 이어 받는다.
 {name:'fees',when:true,args:['scripts/detail/fees.mjs','--until',CUTOFF]},
];
let failed=0;
for(const s of STEPS.filter(s=>s.when)){
 if(!anyTime&&minutes()>=cutoffMinutes){console.log(`SKIP ${s.name}: past ${CUTOFF}`);continue;}
 console.log(`RUN ${s.name}`);
 if(dry)continue;
 const r=spawnSync(process.execPath,s.args,{stdio:'inherit',windowsHide:true});
 if(r.status!==0){failed++;console.error(`FAILED ${s.name}: ${r.status}`);}
}
process.exitCode=failed?1:0;
