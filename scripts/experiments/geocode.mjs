import {mkdir,writeFile} from 'node:fs/promises';
process.loadEnvFile('.env.local');
const results=[];
for(const address of ['서울특별시 강남구 선릉로 221','서울특별시 관악구 봉천동 65-30']) {
  const url=new URL('https://maps.apigw.ntruss.com/map-geocode/v2/geocode');
  url.searchParams.set('query',address);
  try {
    const response=await fetch(url,{headers:{'x-ncp-apigw-api-key-id':process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID,'x-ncp-apigw-api-key':process.env.NAVER_MAP_CLIENT_SECRET},signal:AbortSignal.timeout(15000)});
    const data=await response.json();
    results.push({query:address,httpStatus:response.status,status:data.status,addresses:(data.addresses||[]).map(a=>({roadAddress:a.roadAddress,jibunAddress:a.jibunAddress,x:a.x,y:a.y,addressElements:a.addressElements}))});
  } catch(e) {results.push({query:address,error:e.name});}
}
await mkdir('docs/experiments/2026-10-07',{recursive:true});
await writeFile('docs/experiments/2026-10-07/geocoding.json',JSON.stringify({capturedAt:new Date().toISOString(),results},null,2));
console.log(JSON.stringify(results.map(r=>({query:r.query,status:r.httpStatus,count:r.addresses?.length,jibun:r.addresses?.[0]?.jibunAddress})),null,2));
