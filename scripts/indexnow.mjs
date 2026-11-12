// IndexNow: tell Bing, Naver (and other IndexNow engines) which lineestate pages changed since the last
// send (lineestate docs/data-factory-requests.md #17). Google and Daum do not take part; they follow the
// sitemap's lastmod. Only pages the sitemap lists are sent (아파트 only; villa/officetel pages are left out):
//   - /properties/<id>        current 아파트·주상복합 rounds whose updated_at moved
//   - /complexes/<kapt_code>  apartment complexes whose linked market_places.refreshed_at moved
//   - /market/<id>            apartment market places without a kapt_code whose refreshed_at moved
//   - /near/<역>/<평형>        (--near) pages whose content changed today (app.near_pages data.asOf = today KST),
//     plus /near/<역> of each such station
// The watermark (data/daily/indexnow.json) is advanced only after every batch is accepted, so a failed
// send is retried by the next job instead of being lost, and the same address is not resent daily.
//   node scripts/indexnow.mjs [--near] [--dry] [--since <iso>]
import {createClient} from '@supabase/supabase-js';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
process.loadEnvFile('.env.local');

const SITE='https://lineestate.co.kr';
const KEY='fe61cd23970087bccfcb064d13d49167'; // public value, served at SITE/KEY.txt
const ENDPOINT='https://api.indexnow.org/indexnow';
const BATCH=10_000;
const SIDO=['서울특별시','경기도','인천광역시'];
const STATE='data/daily/indexnow.json';
const BANDS={t:'10평대',b:'20평대',m:'30평대',l:'40평대이상'}; // lineestate lib/data/near-core.ts NEAR_BANDS

const args=process.argv.slice(2);
const dry=args.includes('--dry'),withNear=args.includes('--near');
const sinceArg=args[args.indexOf('--since')+1];
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const state=JSON.parse(await readFile(STATE,'utf8').catch(()=>'{}'));
// First run on a PC: the last day only (the full first send was done from lineestate on 2026-11-12).
const since=args.includes('--since')?sinceArg:state.sentUntil??new Date(Date.now()-26*3600_000).toISOString();
const until=new Date().toISOString();

// Page through a query 1000 rows at a time (the API's row cap).
async function all(build){
 const rows=[];
 for(let from=0;;from+=1000){
  const {data,error}=await build().range(from,from+999);
  if(error)throw new Error(error.message);
  rows.push(...data);
  if(data.length<1000)return rows;
 }
}

const properties=await all(()=>db.from('properties').select('id').in('sido',SIDO).eq('is_current',true).in('usage_type',['아파트','주상복합']).gte('updated_at',since).order('id'));
const places=await all(()=>db.from('market_places').select('id,kapt_code,kind').in('sido',SIDO).gte('refreshed_at',since).order('id'));
const linked=[...new Set(places.filter(p=>p.kapt_code).map(p=>p.kapt_code))];
const complexes=[];
for(let i=0;i<linked.length;i+=200){
 const {data,error}=await db.from('complexes').select('kapt_code').in('kapt_code',linked.slice(i,i+200)).in('sido',SIDO).eq('section','apartment');
 if(error)throw new Error(error.message);
 complexes.push(...data.map(c=>c.kapt_code));
}
const market=places.filter(p=>!p.kapt_code&&p.kind==='apt').map(p=>p.id);
let near=[];
if(withNear){
 const today=new Date(Date.now()+9*3600_000).toISOString().slice(0,10);
 near=await all(()=>db.schema('app').from('near_pages').select('slug,band').eq('data->>asOf',today).order('slug').order('band'));
}

const nearStations=[...new Set(near.filter(n=>BANDS[n.band]).map(n=>n.slug))];
const urls=[
 ...properties.map(p=>`${SITE}/properties/${p.id}`),
 ...complexes.sort().map(k=>`${SITE}/complexes/${k}`),
 ...market.map(id=>`${SITE}/market/${encodeURIComponent(id)}`),
 ...near.filter(n=>BANDS[n.band]).map(n=>`${SITE}/near/${encodeURIComponent(n.slug)}/${encodeURIComponent(BANDS[n.band])}`),
 // The station overview /near/<역> lists its 평형 pages, so it changes with any of them.
 ...nearStations.map(slug=>`${SITE}/near/${encodeURIComponent(slug)}`),
];
const counts={properties:properties.length,complexes:complexes.length,market:market.length,near:near.length,nearStations:nearStations.length};

const sent=[];
if(!dry){
 for(let i=0;i<urls.length;i+=BATCH){
  const urlList=urls.slice(i,i+BATCH);
  const res=await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json; charset=utf-8'},
   body:JSON.stringify({host:new URL(SITE).host,key:KEY,keyLocation:`${SITE}/${KEY}.txt`,urlList}),signal:AbortSignal.timeout(60_000)});
  // 200/202 accepted; 400 bad request, 403 key mismatch, 422 URL outside the host, 429 too many.
  const text=(await res.text()).slice(0,200);
  if(res.status!==200&&res.status!==202){
   console.error(`IndexNow ${res.status} ${text}`);
   console.log(JSON.stringify({since,...counts,sent:sent.reduce((a,b)=>a+b,0),failed:`HTTP ${res.status}`}));
   process.exit(1);
  }
  sent.push(urlList.length);
 }
 await mkdir('data/daily',{recursive:true});
 await writeFile(STATE,JSON.stringify({sentUntil:until,last:{at:until,since,...counts}},null,1));
}
console.log(JSON.stringify({since,...counts,urls:urls.length,sent:dry?'dry':sent.reduce((a,b)=>a+b,0)}));
