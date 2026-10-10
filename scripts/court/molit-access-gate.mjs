import { readFile, writeFile } from 'node:fs/promises';
const dayOf=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
async function load(path){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
export async function assertMolitAllowed(path,{now=new Date()}={}) {
 const pause=await load(path);if(!pause)return;
 const day=pause.day??dayOf(new Date(pause.pausedAt));
 if(day>=dayOf(now))throw Error('MOLIT paused after access refusal for this Korean day');
}
export async function recordMolitRefusal(status,path,code=null,{now=new Date()}={}) {
 if(![401,403,429].includes(status)&&(code==null||['000','00'].includes(String(code))))return;
 const old=await load(path),day=dayOf(now);
 const oldDay=old?.day??(old?.pausedAt?dayOf(new Date(old.pausedAt)):null);
 if(oldDay===day)return old;
 const yesterday=new Date(day+'T00:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);
 const consecutiveDays=oldDay===yesterday.toISOString().slice(0,10)?(old.consecutiveDays??1)+1:1;
 const pause={status,code,day,pausedAt:now.toISOString(),consecutiveDays,notifyUser:consecutiveDays===3,reason:'Official API refusal; stop today and allow retry on next Korean day'};
 await writeFile(path,JSON.stringify(pause,null,2));return pause;
}
