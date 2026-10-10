import{readFile,writeFile,rename,appendFile,access}from'node:fs/promises';import{migrate}from'./budget.mjs';
try{await access('data/onbid/running.lock');throw Error('COLLECTOR_LOCK_PRESENT');}catch(e){if(e.code!=='ENOENT')throw e;}
try{await access('data/onbid/STOP');throw Error('STOP_PRESENT');}catch(e){if(e.code!=='ENOENT')throw e;}
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()),root='data/onbid';
const b=JSON.parse(await readFile(`${root}/budget.json`,'utf8')),p=JSON.parse(await readFile(`${root}/progress.json`,'utf8')),d=JSON.parse(await readFile(`${root}/detail-progress.json`,'utf8'));
if(day!=='2026-10-10'||d.status!=='budget_wait')throw Error('UNEXPECTED_MIGRATION_STATE');
const next=migrate(b,day,p.requests,d.requests);await writeFile(`${root}/budget.json.migration.tmp`,JSON.stringify(next,null,2));await rename(`${root}/budget.json.migration.tmp`,`${root}/budget.json`);
const record={at:new Date().toISOString(),action:'separate_service_budget',cause:'user clarified each API1000/day; previous shared quota incorrect',usage:next.serviceDays[day],legacyCombined:b.days[day],probes:{list:2,detail:2},tests:'13 node tests passed',healthyCollectorStopped:false};
await appendFile(`${root}/recovery.jsonl`,JSON.stringify(record)+'\n');await appendFile(`${root}/handoff.md`,`\n## ${record.at}\n사용자 최신지시: 목록/상세 각1000회. 정상PID5932는 중지하지않고 기존합산1000 자동예산종료뒤 CIM부재/STOP없음/lock없음 확인 후 budget v2로이관. 목록${record.usage.list},상세${record.usage.detail},합산역사${record.legacyCombined}보존. 각서비스 테스트2회포함. 같은체크포인트 재개, 승인원기록유지. 서비스별한도테스트13통과; automation-2 각1000정책변경.\n`);
console.log(JSON.stringify(record));
