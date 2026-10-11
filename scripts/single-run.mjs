// One collector process at a time per data folder. A lock whose process is gone is taken over.
import {open,readFile,unlink} from 'node:fs/promises';
import {unlinkSync} from 'node:fs';
const alive=pid=>{try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}};
// Returns true when this process holds the lock (released on exit), false when another live one does.
export async function singleRun(dir,command){
 const path=`${dir}/running.lock`;
 for(let attempt=0;attempt<2;attempt++){
  try{
   const handle=await open(path,'wx');
   await handle.writeFile(JSON.stringify({pid:process.pid,command,startedAt:new Date().toISOString()}));await handle.close();
   process.on('exit',()=>{try{unlinkSync(path);}catch{}});
   return true;
  }catch(e){
   if(e.code!=='EEXIST')throw e;
   let held=null;try{held=JSON.parse(await readFile(path,'utf8'));}catch{}
   if(held&&alive(held.pid))return false;
   await unlink(path).catch(()=>{});
  }
 }
 return false;
}
