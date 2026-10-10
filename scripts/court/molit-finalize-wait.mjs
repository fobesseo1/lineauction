import {readFile,writeFile,open,unlink,access} from 'node:fs/promises';import {spawn} from 'node:child_process';import {setTimeout as delay} from 'node:timers/promises';
import {molitFinalizeReady} from './molit-finalize-ready.mjs';
const root='data/court/pipeline',lockPath=`${root}/molit-finalizer.lock`;
const lock=await open(lockPath,'wx');await lock.writeFile(JSON.stringify({pid:process.pid}));
const load=async p=>{try{return JSON.parse(await readFile(p,'utf8'));}catch(e){if(e.code==='ENOENT'||e instanceof SyntaxError)return null;throw e;}};
const exists=async p=>{try{await access(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}};
try{for(;;){
 const audit=await load('data/court/standalone/case-repair-all-photos-2026-10-09-audit.json'),photos=await load(`${root}/photos-latest.json`),staged=await load(`${root}/molit-staged-progress.json`);
 const collectorActive=await exists('data/court/standalone/running.lock'),pipelineActive=await exists(`${root}/running.lock`);
 if(molitFinalizeReady({audit,photos,staged,collectorActive,pipelineActive})){
  const child=spawn(process.execPath,['scripts/court/molit-staged-apply.mjs'],{stdio:'inherit',windowsHide:true});
  const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error('Stored MOLIT DB apply failed; inspect molit-staged-db.json');break;
 }
 await delay(15000);
}}catch(e){await writeFile(`${root}/molit-finalizer-error.json`,JSON.stringify({at:new Date().toISOString(),message:e.message}));process.exitCode=1;}
finally{await lock.close();await unlink(lockPath);}
