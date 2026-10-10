import {writeJson} from './atomic.mjs';
import {readFile,writeFile,rename,appendFile} from 'node:fs/promises';
const root='data/onbid';
const p=JSON.parse(await readFile(`${root}/progress.json`,'utf8'));
async function optional(name){try{return JSON.parse(await readFile(`${root}/${name}`,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
const d=await optional('detail-progress.json'),budget=await optional('budget.json');
let previous;try{previous=JSON.parse(await readFile(`${root}/monitor.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
const snapshot={checkedAt:new Date().toISOString(),runStartedAt:p.runStartedAt,status:p.status,properties:p.properties,conditions:p.conditions,pages:p.pages,dbRows:p.dbRows,dbUpdatedAt:p.dbUpdatedAt,lastProgressAt:p.updatedAt,partition:p.partition,error:p.errors?.[0]?.code??null,budgetDay:day,requests:budget?.days?.[day]??0,budget:1000,detail:d?{runStartedAt:d.runStartedAt,status:d.status,processed:d.processed,total:d.total,remaining:d.remaining,matchedConditions:d.matchedConditions,missingConditions:d.missingConditions,photoLinks:d.photoLinks,documentLinks:d.documentLinks,dbRows:d.dbRows,dbUpdatedAt:d.dbUpdatedAt,lastProgressAt:d.updatedAt,error:d.errors?.[0]?.code??null}:null};
snapshot.serviceUsage=budget?.serviceDays?.[day]??(day==='2026-10-10'?{list:276,detail:Math.max(0,(budget?.days?.[day]??0)-276)}:{list:0,detail:0});
snapshot.budget=2000;snapshot.serviceLimits={list:1000,detail:1000};
const sameRun=previous?.runStartedAt===snapshot.runStartedAt;
snapshot.increase=sameRun?Object.fromEntries(['properties','conditions','pages','dbRows'].map(k=>[k,snapshot[k]-previous[k]])):null;
snapshot.newRun=!sameRun;
if(d&&previous?.detail?.runStartedAt===d.runStartedAt)snapshot.detail.increase=Object.fromEntries(['processed','matchedConditions','photoLinks','documentLinks','dbRows'].map(k=>[k,(d[k]??0)-(previous.detail[k]??0)]));
await writeJson(`${root}/monitor.json`,snapshot);
await appendFile(`${root}/monitor-history.jsonl`,JSON.stringify(snapshot)+'\n');
console.log(JSON.stringify(snapshot));
