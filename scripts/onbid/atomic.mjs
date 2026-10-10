import {writeFile,rename} from 'node:fs/promises';
export async function replaceWithRetry(from,to,{replace=rename,sleep=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 for(let attempt=0;;attempt++){
  try{await replace(from,to);return;}catch(e){
   if(!['EPERM','EBUSY','EACCES'].includes(e.code)||attempt>=6)throw e;
   await sleep(40*2**attempt);
  }
 }
}
export async function writeJson(path,value){
 const temp=`${path}.${process.pid}.tmp`;
 await writeFile(temp,JSON.stringify(value,null,2));
 await replaceWithRetry(temp,path);
}
