// 금융상품한눈에 주담대·전세대출 상품 → public.loan_products (은행·저축은행·보험·여신전문·금융투자).
//   node scripts/finance/finlife-products.mjs
// ~15 small requests (companies, then two product lists per 권역, every page). Writes only rows whose
// content changed, and removes products the API no longer lists — only when every request succeeded.
import {createClient} from '@supabase/supabase-js';
import {FIN_GROUPS,APIS,HOMEPAGE_FALLBACK,productRows,rowKey,changed} from './finlife-core.mjs';
process.loadEnvFile('.env.local');

const KEY=process.env.FINLIFE_API_KEY;
if(!KEY)throw Error('FINLIFE_API_KEY missing in .env.local');
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Every page of one list for one 권역 → {baseList, optionList}.
async function all(api,group){
 const merged={baseList:[],optionList:[]};
 for(let page=1,max=1;page<=max;page++){
  for(let attempt=1;;attempt++){
   try{
    const r=await fetch(`https://finlife.fss.or.kr/finlifeapi/${api}.json?auth=${KEY}&topFinGrpNo=${group}&pageNo=${page}`,{signal:AbortSignal.timeout(60_000)});
    const j=(await r.json()).result;
    if(j.err_cd!=='000')throw Error(`FINLIFE_${j.err_cd}:${j.err_msg}`);
    merged.baseList.push(...j.baseList??[]);merged.optionList.push(...j.optionList??[]);max=Number(j.max_page_no)||1;
    break;
   }catch(e){if(attempt>=3)throw e;await sleep(10_000*attempt);}
  }
  await sleep(500);
 }
 return merged;
}

const homepages=new Map(Object.entries(HOMEPAGE_FALLBACK));
for(const group of Object.keys(FIN_GROUPS))for(const c of (await all('companySearch',group)).baseList)if(c.homp_url?.trim())homepages.set(c.fin_co_no,c.homp_url.trim());

const fresh=new Map();
for(const [kind,api] of Object.entries(APIS))for(const group of Object.keys(FIN_GROUPS))
 for(const r of productRows(kind,group,await all(api,group),homepages))fresh.set(rowKey(r),r);
if(fresh.size<100)throw Error(`FINLIFE_TOO_FEW_${fresh.size}`);  // a broken answer must not wipe the table

const stored=new Map();
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('loan_products').select('*').order('id').range(from,from+999);
 if(error)throw Error(error.message);
 for(const r of data)stored.set(rowKey(r),r);
 if(data.length<1000)break;
}
const today=new Date(Date.now()+9*3600_000).toISOString().slice(0,10);
const writes=[...fresh].filter(([k,r])=>!stored.has(k)||changed(stored.get(k),r)).map(([,r])=>({...r,fetched_on:today}));
const gone=[...stored].filter(([k])=>!fresh.has(k)).map(([,r])=>r.id);
for(let i=0;i<writes.length;i+=500){
 const {error}=await supa.from('loan_products').upsert(writes.slice(i,i+500),{onConflict:'product_kind,fin_co_code,product_code,collateral_type,repayment_type,rate_type'});
 if(error)throw Error(`DB_${error.code}:${error.message}`);
}
for(let i=0;i<gone.length;i+=200){
 const {error}=await supa.from('loan_products').delete().in('id',gone.slice(i,i+200));
 if(error)throw Error(`DB_${error.code}:${error.message}`);
}
const months=[...new Set([...fresh.values()].map(r=>r.disclosure_month))].sort().join(',');
console.log(`products ${fresh.size} (공시 ${months}), written ${writes.length}, removed ${gone.length}`);
