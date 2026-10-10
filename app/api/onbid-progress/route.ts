import {readFile} from 'node:fs/promises';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function read(name:string){try{return JSON.parse(await readFile(`data/onbid/${name}`,'utf8'));}catch{return null;}}
export async function GET(){
 const [p,b,pause,d]=await Promise.all([read('progress.json'),read('budget.json'),read('access-paused.json'),read('detail-progress.json')]);
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 const serviceUsage=b?.serviceDays?.[day]??(day==='2026-10-10'?{list:276,detail:Math.max(0,(b?.days?.[day]??0)-276)}:{list:0,detail:0});
 return Response.json({status:p?.status??'pending',updatedAt:p?.updatedAt,pages:p?.pages??0,properties:p?.properties??0,conditions:p?.conditions??0,dbRows:p?.dbRows??0,requests:b?.days?.[day]??0,budget:1000,serviceUsage,detailStatus:pause?.detail?.requiresUserApproval?'permission_required':d?.status??'pending',detail:{processed:d?.processed??0,total:d?.total??p?.properties??0,remaining:d?.remaining??p?.properties??0,matchedConditions:d?.matchedConditions??0,missingConditions:d?.missingConditions??0,photos:d?.photoLinks??0,thumbnails:d?.thumbnailLinks??0,documents:d?.documentLinks??0,withPhotos:d?.propertiesWithPhotos??0,withDocuments:d?.propertiesWithDocuments??0,dbRows:d?.dbRows??0,dbUpdatedAt:d?.dbUpdatedAt??null,updatedAt:d?.updatedAt??null},error:d?.errors?.[0]?.code??p?.errors?.[0]?.code??null},{headers:{'Cache-Control':'no-store'}});
}

