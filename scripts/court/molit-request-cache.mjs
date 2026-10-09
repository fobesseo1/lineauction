import {readFile,writeFile,stat} from 'node:fs/promises';
import {XMLParser} from 'fast-xml-parser';
const parser=new XMLParser({parseTagValue:false});
const koreanDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

// Reuse only a complete, successful, fresh month. Partial files never imply coverage.
export async function cachedMolitMonth(root,region,month,{now=new Date(),ttlMs=86400000}={}) {
 if(!/^\d{5}$/.test(region)||!/^\d{6}$/.test(month))throw Error('Invalid MOLIT cache key');
 let total=null,rows=[],oldest=now.getTime();
 for(let page=1;page<=100;page++){
  const path=`${root}/molit-${region}-${month}-${page}.xml`;
  let xml,info;try{[xml,info]=await Promise.all([readFile(path,'utf8'),stat(path)]);}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(now.getTime()-info.mtimeMs>ttlMs||info.mtimeMs>now.getTime()+60000)return null;
  const data=parser.parse(xml).response;
  if(!['000','00'].includes(data?.header?.resultCode))return null;
  const count=Number(data?.body?.totalCount);
  if(!Number.isSafeInteger(count)||count<0||(total!==null&&count!==total))return null;
  total=count;let batch=data.body.items?.item??[];if(!Array.isArray(batch))batch=[batch];
  if(batch.length>1000)return null;rows.push(...batch);oldest=Math.min(oldest,info.mtimeMs);
  if(rows.length===total)return {rows,total,received:rows.length,observedAt:new Date(oldest).toISOString()};
  if(!batch.length||rows.length>total)return null;
 }
 return null;
}

// This is an app-side conservative budget, not a claim about the account's provider quota.
export async function reserveMolitRequest(path,{now=new Date(),limit=100}={}) {
 if(!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid MOLIT request budget');
 const day=koreanDay(now);let budget;
 try{budget=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!budget||budget.day!==day)budget={day,requests:0};
 if(!Number.isSafeInteger(budget.requests)||budget.requests<0)throw Error('Invalid MOLIT budget state');
 if(budget.requests>=limit)throw Error('MOLIT local daily request budget exhausted; defer remaining matching');
 budget.requests++;budget.limit=limit;await writeFile(path,JSON.stringify(budget,null,2));return budget;
}
