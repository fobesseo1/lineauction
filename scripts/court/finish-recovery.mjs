// Wait for the current writer, then process only unattempted, still-open missing material.
import {readFile,writeFile,appendFile,rename} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {recoveryStatus} from './recovery-status.mjs';
const root='data/court/standalone',since='2026-10-08T15:00:00.000Z';
const load=async(p,f)=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT')return f;throw e;}};
const stopped=async()=>{try{await readFile(`${root}/STOP`);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
const log=async(action,extra={})=>appendFile(`${root}/ai-monitor-recovery.jsonl`,JSON.stringify({at:new Date().toISOString(),action,...extra})+'\n');
const save=async(path,value)=>{const temporary=`${path}.${process.pid}.tmp`;await writeFile(temporary,JSON.stringify(value,null,2));await rename(temporary,path);};
const publish=async()=>{
 const [state,media,first,last]=await Promise.all([load('data/court/current.json',{}),load('data/court/media/manifest.json',[]),load(`${root}/case-repair-2026-10-09-results.json`,{items:{}}),load(`${root}/case-repair-2026-10-09-final-results.json`,{items:{}})]);
 const audit=recoveryStatus(state,media,{...first.items,...last.items},{since});
 const summary={...audit};delete summary.items;await save(`${root}/recovery-outcomes-2026-10-09.json`,audit);await save(`${root}/recovery-summary.json`,summary);return audit;
};
for(;;){
 if(await stopped()){await log('finish-recovery-stopped-before-start');process.exit(0);}
 const lock=await load(`${root}/running.lock`,null);if(!lock)break;
 try{process.kill(lock.pid,0);}catch{throw Error('Collector lock exists but PID unavailable; verify Windows process before recovery');}
 await publish();await delay(20000);
}
const audit=await publish();const keys=audit.items.filter(x=>x.status==='pending').map(x=>x.key);
await log('start-final-pending-material-pass',{targets:keys.length,counts:audit.counts});
if(keys.length){
 const file=`${root}/recheck-final-2026-10-09.json`;await writeFile(file,JSON.stringify(keys,null,2));
 let childFinished=false;
 const completion=new Promise((resolve,reject)=>{const child=spawn(process.execPath,['scripts/court/case-repair.mjs',`--recheck-file=${file}`,'--checkpoint-tag=2026-10-09-final','--limit=100000'],{stdio:'inherit',windowsHide:true});child.on('error',error=>{childFinished=true;reject(error);});child.on('exit',code=>{childFinished=true;resolve(code);});});
 const updates=(async()=>{while(!childFinished){await delay(20000);if(!childFinished)try{await publish();}catch(error){await log('recovery-summary-update-failed',{message:error.message});}}})();
 const code=await completion;await updates;
 const result=await publish();await log('finish-final-pending-material-pass',{code,counts:result.counts,passFinished:result.passFinished,allDataAcquired:result.allDataAcquired});if(code)process.exitCode=code;
}else await log('all-material-attempts-resolved',{counts:audit.counts});
