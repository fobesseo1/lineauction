import {readFile} from 'node:fs/promises';
import {photoCollectionSummary} from '@/lib/court-monitor-summary';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const hostname=new URL(request.url).hostname;
 if(!['localhost','127.0.0.1','[::1]'].includes(hostname))return Response.json({error:'로컬 PC에서만 확인할 수 있습니다.'},{status:403});
 try{
  const data=JSON.parse(await readFile('data/court/standalone/health.json','utf8'));
  const progress=await readFile('data/court/standalone/progress.json','utf8').then(JSON.parse).catch(()=>null);
  const audit=await readFile('data/court/standalone/recovery-final-audit.json','utf8').then(JSON.parse).catch(()=>null);
  if(data.run&&progress?.startedAt===data.run.startedAt){data.run.mode=progress.mode;data.run.verified=progress.verified;}
  const coverage=audit?{checkedAt:audit.checkedAt,detailDisabled:audit.detailDisabled,propertyNotProvided:audit.propertyNotProvided}:undefined;
  const recovery=await readFile('data/court/standalone/recovery-summary.json','utf8').then(JSON.parse).catch(()=>undefined);
  const load=async(path:string)=>readFile(path,'utf8').then(JSON.parse).catch(()=>null);
  const [targets,results,manifest,photosDb,budget,latest,gate]=await Promise.all([
   load('data/court/standalone/all-photo-targets-2026-10-09.json'),load('data/court/standalone/case-repair-all-photos-2026-10-09-results.json'),
   load('data/court/media/manifest.json'),load('data/court/pipeline/photos-latest.json'),load('data/court/pipeline/molit-request-budget.json'),
   load('data/court/pipeline/latest.json'),load('data/court/pipeline/molit-access-paused.json')]);
  // Read-only snapshots: never change checkpoints or issue collection requests here.
  const photoCollection=targets&&results&&manifest?{...photoCollectionSummary(targets,results.items,manifest,null),db:photosDb?{status:photosDb.status,finishedAt:photosDb.finishedAt,errors:photosDb.errors?.length??0}:null}:null;
  if(photoCollection&&latest?.media!==undefined&&Date.parse(latest.finishedAt)<Date.parse(progress?.startedAt)){
   photoCollection.newPhotos=Math.max(0,new Set(manifest.map((m:{id:string})=>m.id)).size-latest.media);
  }
  if(photoCollection)photoCollection.errors=Math.max(photoCollection.errors,progress?.failed??0);
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const molit=latest?{matchedProperties:latest.matchedProperties,matchedTrades:latest.matchedTrades,unmatched:latest.unmatched,
   retry:latest.errors?.filter((e:{stage?:string})=>e.stage==='matching').length??0,finishedAt:latest.finishedAt,
   paused:!!gate,used:budget?.day===day?budget.requests:0,limit:budget?.limit??1000,day}:null;
  const monitorFresh=Date.now()-Date.parse(data.checkedAt)<60000;
  return Response.json({...data,run:progress??data.run,monitorFresh,coverage,recovery,photoCollection,molit},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({monitorFresh:false,health:{state:'unavailable',label:'감시 기록 없음',message:'감시기가 시작되지 않았거나 상태 파일을 읽을 수 없습니다.'}},{headers:{'Cache-Control':'no-store'}});}
}
