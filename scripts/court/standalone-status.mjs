import { readFile } from 'node:fs/promises';
try{
 const p=JSON.parse(await readFile('data/court/standalone/progress.json','utf8'));
 let processCheck='alive';try{process.kill(p.pid,0);}catch(error){processCheck=error.code==='EPERM'?'permission-denied':'not-visible';}
 console.log(JSON.stringify({processCheck,status:p.status,pid:p.pid,startedAt:p.startedAt,finishedAt:p.finishedAt,current:p.current,attempted:p.attempted,succeeded:p.succeeded,failed:p.failed,photos:p.photos,syncStatus:p.syncStatus,lastSyncAt:p.lastSyncAt,error:p.error},null,2));
}catch(error){if(error.code!=='ENOENT')throw error;console.log('독립 수집 실행 기록이 없습니다.');}
