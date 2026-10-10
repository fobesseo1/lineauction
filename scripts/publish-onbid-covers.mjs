// Publish saved official thumbnail links; never call Onbid APIs or download images.
// Raw observations remain service-only. No schema or RLS changes are needed.
import {createClient} from '@supabase/supabase-js';
import {officialOnbidCover} from '../lib/onbid-cover.ts';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let published=0,missing=0;
for(let offset=0;;offset+=500){
 const result=await db.from('onbid_observations').select('property_id,observed_at,list_payload,property:properties!inner(source,sido,title)').eq('property.source','onbid').in('property.sido',['서울특별시','경기도']).order('property_id').range(offset,offset+499);
 if(result.error)throw Error(`Saved cover read failed: ${result.error.code}`);
 const rows=[];
 for(const saved of result.data){
  const url=officialOnbidCover(saved.list_payload?.thnlImgUrlAdr);
  if(!url){missing++;continue;}
  rows.push({id:`onbid-api-thumbnail:${saved.property_id}`,property_id:saved.property_id,path:url,source_url:url,observed_at:saved.observed_at,
   // Zero means unknown / not downloaded, rather than invented dimensions or sizes.
   width:0,height:0,bytes:0,original_bytes:0,alt:'온비드 API 대표 썸네일',sort_order:0});
 }
 if(rows.length){const write=await db.from('property_media').upsert(rows,{onConflict:'id'});if(write.error)throw Error(`Public cover write failed: ${write.error.code}`);published+=rows.length;}
 if(result.data.length<500)break;
}
console.log(JSON.stringify({publishedThumbnailLinks:published,withoutProvidedThumbnail:missing,onbidApiRequests:0,imageDownloads:0}));
