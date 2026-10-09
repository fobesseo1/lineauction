import {readFile} from 'node:fs/promises';
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
  const monitorFresh=Date.now()-Date.parse(data.checkedAt)<60000;
  return Response.json({...data,monitorFresh,coverage,recovery},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({monitorFresh:false,health:{state:'unavailable',label:'감시 기록 없음',message:'감시기가 시작되지 않았거나 상태 파일을 읽을 수 없습니다.'}},{headers:{'Cache-Control':'no-store'}});}
}
