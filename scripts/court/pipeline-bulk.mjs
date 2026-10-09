import {readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertMolitAllowed,recordMolitRefusal} from './molit-access-gate.mjs';
import {cachedMolitMonth,reserveMolitRequest} from './molit-request-cache.mjs';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {XMLParser} from 'fast-xml-parser';
import {mapCourtProperty,apartmentTarget,recentMonths,comparisonExclusion} from './pipeline-core.mjs';
import {lifecycleFromItem} from './lifecycle.mjs';
import {collectionCoverage} from './coverage.mjs';
import {inSeoulGyeonggi} from './scope.mjs';
import {classifyApartmentTrade} from '../experiments/comparison.mjs';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const parser=new XMLParser({parseTagValue:false});
const root='data/court/pipeline';await mkdir(root,{recursive:true});
const lockPath=`${root}/running.lock`;let lock;
try{lock=await open(lockPath,'wx');}catch{throw Error('Pipeline already running; inspect lock before retrying');}
const check=({data,error})=>{if(error)throw Error(`${error.code}: ${error.message}`);return data;};
const chunks=(rows,size=200)=>Array.from({length:Math.ceil(rows.length/size)},(_,i)=>rows.slice(i*size,(i+1)*size));
const report={startedAt:new Date().toISOString(),properties:{created:0,updated:0,unchanged:0,stale:0,skipped:0},courts:{},matchedProperties:0,matchedTrades:0,unmatched:0,errors:[],apiQueries:[],lifecycle:{observed:0,'needs-recheck':0,'needs-review':0,closed:0}};
const cache=new Map();let runId,lastRequestAt=0;
async function tradesFor(region){
 await assertMolitAllowed(`${root}/molit-access-paused.json`);
 if(cache.has(region))return cache.get(region);
 const result={rows:[],months:[],observedAt:new Date().toISOString()};
 for(const month of recentMonths(new Date())){
  const saved=await cachedMolitMonth(root,region,month);
  if(saved){result.rows.push(...saved.rows);result.months.push({month,total:saved.total,received:saved.received,cached:true});if(saved.observedAt<result.observedAt)result.observedAt=saved.observedAt;continue;}
  let total=null,received=0;
  for(let page=1;page<=100;page++){
   const url=new URL('https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade');
   url.search=new URLSearchParams({serviceKey:process.env.MOLIT_API_KEY,LAWD_CD:region,DEAL_YMD:month,pageNo:String(page),numOfRows:'1000'}).toString();
   await reserveMolitRequest(`${root}/molit-request-budget.json`,{limit:Number(process.env.MOLIT_DAILY_REQUEST_BUDGET??500)});
   await delay(Math.max(0,1100-(Date.now()-lastRequestAt)));lastRequestAt=Date.now();
   let response;try{response=await fetch(url,{signal:AbortSignal.timeout(20000)});}catch{throw Error(`MOLIT ${region}/${month}: request failed`);}
   if(!response.ok){await recordMolitRefusal(response.status,`${root}/molit-access-paused.json`);throw Error(`MOLIT HTTP ${response.status}`);}
   const xml=await response.text();const parsed=parser.parse(xml),data=parsed.response;
   const code=data?.header?.resultCode??parsed.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode;
   if(!['000','00'].includes(code)){await recordMolitRefusal(response.status,`${root}/molit-access-paused.json`,code);throw Error(`MOLIT ${region}/${month}: rejected (${String(code??'unknown')})`);}
   const nextTotal=Number(data.body.totalCount);if(total!==null&&total!==nextTotal)throw Error('MOLIT total changed');total=nextTotal;
   let rows=data.body.items?.item??[];if(!Array.isArray(rows))rows=[rows];received+=rows.length;result.rows.push(...rows);
   await writeFile(`${root}/molit-${region}-${month}-${page}.xml`,xml);
   report.apiQueries.push({region,month,page,total,returned:rows.length});
   if(received===total)break;if(!rows.length||received>total||page===100)throw Error('Incomplete MOLIT pagination');
  }result.months.push({month,total,received});
 }cache.set(region,result);return result;
}
try{
 runId=check(await db.from('collection_runs').insert({status:'running'}).select('id').single()).id;
 const state=JSON.parse(await readFile('data/court/current.json','utf8'));
 report.collectionCoverage=await collectionCoverage();
 report.scope='seoul-gyeonggi';
 const allItems=Object.values(state.items);
 report.outsideScope=allItems.filter(item=>!inSeoulGyeonggi(item)).length;
 const items=allItems.filter(inSeoulGyeonggi).map(item=>({item,input:mapCourtProperty(item)}));
 const accepted=items.filter(x=>x.input);report.properties.skipped=items.length-accepted.length;
 const outcomes=new Map();
 for(const batch of chunks(accepted,250)){
  try{const results=check(await db.rpc('upsert_court_batch',{p_items:batch.map(x=>({key:x.item.key,input:x.input,checkedAt:x.item.lastSeenAt}))}));
   for(const result of results){outcomes.set(result.key,result.outcome);report.properties[result.outcome]++;}
  }catch(error){report.errors.push({stage:'properties',keys:batch.map(x=>x.item.key),message:error.message});}
 }
 const ids=new Map();for(let offset=0;;offset+=1000){
  const rows=check(await db.from('properties').select('id,source_property_id,auction_condition_id').eq('source','court').order('id').range(offset,offset+999));
  for(const p of rows)ids.set(`${p.source_property_id}:${p.auction_condition_id}`,p.id);if(rows.length<1000)break;
 }
 const observations=[],lifecycles=[],comparisons=[],matchedTransactions=[];
 for(const {item,input} of accepted){
  const outcome=outcomes.get(item.key);if(!outcome||outcome==='stale')continue;
  const id=ids.get(`${input.source_property_id}:${input.auction_condition_id}`);if(!id){report.errors.push({key:item.key,message:'No persisted property ID'});continue;}
  report.courts[item.court]=(report.courts[item.court]??0)+1;
  observations.push({property_id:id,court:item.court,case_number:item.caseNumber,item_number:item.itemNumber,source_url:item.sourceUrl,observed_at:item.lastSeenAt,payload:item});
  const lifecycle=lifecycleFromItem(item);report.lifecycle[lifecycle.state]++;
  lifecycles.push({property_id:id,...lifecycle});
  const target=apartmentTarget(item);
  const snapshot={property_id:id,status:'unmatched',reason:comparisonExclusion(item)??(item.use!=='아파트'?'이 유형의 비교 규칙은 아직 검증 전입니다.':!item.detail?'상세 전용면적과 단지 확인을 기다리고 있습니다.':'단지·지번·전용면적을 확정할 수 없습니다.'),rule_version:'apartment-exact-v1',source_url:'https://rt.molit.go.kr/',observed_at:item.lastSeenAt,coverage:{},target:{court:item.court,caseNumber:item.caseNumber,itemNumber:item.itemNumber,auctionDate:item.auctionDate,courtSourceUrl:item.sourceUrl},trades:[]};
  if(target){try{
   const source=await tradesFor(target.regionCode);
   const matches=source.rows.map(row=>({row,match:classifyApartmentTrade(target,row,source.observedAt.slice(0,10))})).filter(x=>x.match.eligible).sort((a,b)=>b.match.date.localeCompare(a.match.date));
   for(const {row,match} of matches){
    const tradeId=createHash('sha256').update(JSON.stringify(Object.entries(row).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');
    matchedTransactions.push({source:'molit',source_transaction_id:tradeId,property_type:'아파트',complex_name:row.aptNm,transaction_date:match.date,price:String(match.amountWon),area:Number(row.excluUseAr),floor:Number(row.floor),dong:row.umdNm,region_code:target.regionCode});
    snapshot.trades.push({id:tradeId,date:match.date,price:String(match.amountWon),area:Number(row.excluUseAr),floor:Number(row.floor),building:row.aptDong?.trim()||null,method:row.dealingGbn||null,areaDelta:match.areaDelta,floorDelta:match.floorDelta});
   }
   Object.assign(snapshot,{status:matches.length?'matched':'no-trades',reason:matches.length?'같은 단지·법정동·지번, 전용면적 차이 0.1㎡ 이하. 해제 거래 제외. 동 일치는 강제하지 않습니다.':'최근 조회 기간에 조건을 만족하는 거래가 없습니다.',observed_at:source.observedAt,coverage:{months:source.months,regionCode:target.regionCode,complete:true},target:{...snapshot.target,...target}});
   if(matches.length){report.matchedProperties++;report.matchedTrades+=matches.length;report.example={id,title:input.title,trades:matches.length};}
  }catch(error){report.errors.push({stage:'matching',key:item.key,message:error.message});continue;}}
  comparisons.push(snapshot);if(!snapshot.trades.length)report.unmatched++;
 }
 for(const [table,rows] of [['court_observations',observations],['property_lifecycle',lifecycles],['property_comparisons',comparisons]]){
  for(const batch of chunks(rows)){try{check(await db.from(table).upsert(batch));}catch(error){report.errors.push({stage:table,message:error.message});}}
 }
 for(const batch of chunks([...new Map(matchedTransactions.map(t=>[t.source_transaction_id,t])).values()]))check(await db.from('transactions').upsert(batch,{onConflict:'source,source_transaction_id'}));
 let manifest=[];try{manifest=JSON.parse(await readFile('data/court/media/manifest.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
 const media=manifest.filter(m=>ids.has(m.key)).map(m=>({id:m.id,path:m.path,alt:m.alt??'법원 공개 사진',sort_order:Number(m.alt?.match(/_(\d+)$/)?.[1]??99),source_url:m.source_url,observed_at:m.observed_at,width:m.width,height:m.height,bytes:m.bytes,original_bytes:m.original_bytes,property_id:ids.get(m.key)}));
 for(const batch of chunks(media))check(await db.from('property_media').upsert(batch));report.media=media.length;
 report.finishedAt=new Date().toISOString();report.status=report.errors.length?'partial':'completed';
 check(await db.from('collection_runs').update({status:report.status,finished_at:report.finishedAt,report}).eq('id',runId));
 await writeFile(`${root}/latest.json`,JSON.stringify(report,null,2));
 await writeFile(`${root}/${runId}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));if(report.errors.length)process.exitCode=1;
}catch(error){if(runId)await db.from('collection_runs').update({status:'failed',finished_at:new Date().toISOString(),report:{...report,failure:error.message}}).eq('id',runId);throw error;}
finally{await lock.close();await unlink(lockPath);}
