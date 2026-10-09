import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {mapAddress,matchCoordinates} from '../lib/maps/address.ts';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const id=process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID,key=process.env.NAVER_MAP_CLIENT_SECRET;
if(!id||!key)throw Error('Map credentials unavailable');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false}});
const properties=[];
for(let offset=0;;offset+=500){const {data,error}=await db.from('properties_catalog').select('address').eq('source','court').in('sido',['서울특별시','경기도']).range(offset,offset+499);if(error)throw Error('Public address query failed');properties.push(...data);if(data.length<500)break;}
const queries=[...new Set(properties.filter(p=>p.address&&p.address.split(' / ').every(a=>/^(서울특별시|경기도)\s/.test(a.trim()))).map(p=>mapAddress(p.address.split(' / ')[0])))];
await mkdir('data/maps',{recursive:true});await mkdir('public/maps',{recursive:true});
let cache={};try{cache=JSON.parse(await readFile('data/maps/public-position-audit.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const cutoff=Date.now()-30*86400000;let next=0,requests=0,stopped=false;
async function save(){const path='data/maps/public-position-audit.json',temporary=path+'.tmp';await writeFile(temporary,JSON.stringify(cache));await rename(temporary,path);}
async function worker(){while(!stopped){const query=queries[next++];if(!query)return;if(cache[query]?.at>cutoff)continue;
 await delay(150);const url=new URL('https://maps.apigw.ntruss.com/map-geocode/v2/geocode');url.searchParams.set('query',query);
 try{const response=await fetch(url,{headers:{'x-ncp-apigw-api-key-id':id,'x-ncp-apigw-api-key':key},signal:AbortSignal.timeout(10000)});requests++;
 if([401,403,429].includes(response.status)){stopped=true;throw Error(`Map access stopped: HTTP ${response.status}`);}if(!response.ok)throw Error(`Map HTTP ${response.status}`);
 const data=await response.json();const position=matchCoordinates(query,data.addresses??[]);cache[query]={at:Date.now(),position,state:position?'verified':'not-matched'};
 }catch(error){stopped=true;console.error(error.message);}
}}
const timer=setInterval(()=>console.log(JSON.stringify({targets:queries.length,processed:Math.min(next,queries.length),requests,verified:Object.values(cache).filter(x=>x.position).length})),20000);
try{await Promise.all([worker(),worker(),worker()]);await save();if(stopped)process.exitCode=1;
 const positions=Object.fromEntries(queries.filter(q=>cache[q]?.position).map(q=>[q,cache[q].position]));await writeFile('public/maps/positions.json',JSON.stringify(positions));
 console.log(JSON.stringify({targets:queries.length,verified:Object.keys(positions).length,unmatched:queries.filter(q=>cache[q]?.state==='not-matched').length,requests,stopped}));
}finally{clearInterval(timer);}
