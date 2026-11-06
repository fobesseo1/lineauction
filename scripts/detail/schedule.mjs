// Runs whichever complex-detail collectors are due today (KST). Meant as its own nightly task (about 00:30), not a step of
// the morning job: first loads take hours and must not hold up the Onbid and court jobs that follow it;
// each collector resumes from its own cache, so a missed or cut-short day just continues the next time.
//   node scripts/detail/schedule.mjs [--dry-run]
import {spawnSync} from 'node:child_process';
const kst=new Date(Date.now()+9*3600e3),date=kst.getUTCDate(),weekday=kst.getUTCDay(),month=kst.getUTCMonth()+1;
const STEPS=[
 // 전월세 신고가 매일 들어오지만 만기 분포는 천천히 바뀐다.
 {name:'rent-expiries',when:weekday===1,args:['scripts/detail/rent-expiries.mjs']},
 // K-APT 신고 마감이 다음 달 말쯤이라 20일 이후 매일 이어 받는다 (한도까지만).
 {name:'fees',when:date>=20,args:['scripts/detail/fees.mjs','--until','07:00']},
 {name:'childcare',when:date===5,args:['scripts/detail/childcare.mjs']},
 // 새 단지만 부른다 (필지별 캐시).
 {name:'buildings',when:date===6,args:['scripts/detail/buildings.mjs','--phase','titles','--until','07:00']},
 // 분기마다: TAGO 파일은 연 1회, 서울 파일은 월 1회 갱신되고 광역 노선은 드물게 바뀐다.
 {name:'bus',when:date===7&&[1,4,7,10].includes(month),args:['scripts/detail/bus.mjs','--refresh']},
 // 서울 정류소별 노선은 하루 약 1,000건 한도라 날마다 이어 받는다. 다 받으면 아무것도 쓰지 않는다.
 {name:'bus-seoul',when:true,args:['scripts/detail/bus.mjs','--if-new']},
 // 공시는 5월·9월 전후로 바뀐다.
 {name:'schools',when:date===8&&[6,10].includes(month),args:['scripts/detail/schools.mjs']},
];
const dry=process.argv.includes('--dry-run');
let failed=0;
for(const s of STEPS.filter(s=>s.when)){
 console.log(`RUN ${s.name}`);
 if(dry)continue;
 const r=spawnSync(process.execPath,s.args,{stdio:'inherit',windowsHide:true});
 if(r.status!==0){failed++;console.error(`FAILED ${s.name}: ${r.status}`);}
}
process.exitCode=failed?1:0;
