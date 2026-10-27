// 은행연합회 가계대출금리 비교공시 → public.bank_loan_rates (주담대 분할·일시, 전세자금대출 × 신규·잔액).
//   node scripts/finance/kfb-rates.mjs [YYYY-MM ...]
// Without months it checks this month and the one before and skips any month already stored: once a month
// is in, nothing is sent; until then ~7 small requests a day. Publication is near month end at 15:00.
import {createClient} from '@supabase/supabase-js';
import {LOAN_KINDS,BASES,BANK_URLS,bankParams,parseRates} from './kfb-core.mjs';
process.loadEnvFile('.env.local');

const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BASE='https://portal.kfb.or.kr/compare';
const UA={'user-agent':'lineestate-data-factory/1.0'};

async function get(url,init={}){
 for(let attempt=1;;attempt++){
  try{
   const r=await fetch(url,{...init,headers:{...UA,...init.headers},signal:AbortSignal.timeout(60_000)});
   if(!r.ok)throw Error(`KFB_${r.status}`);
   return new TextDecoder('euc-kr').decode(await r.arrayBuffer());
  }catch(e){if(attempt>=3)throw e;await sleep(10_000*attempt);}
 }
}

const kst=new Date(Date.now()+9*3600_000);
const ym=d=>`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
let months=process.argv.slice(2);
const forced=months.length>0;
if(!forced){
 months=[ym(kst),ym(new Date(Date.UTC(kst.getUTCFullYear(),kst.getUTCMonth()-1,1)))];
 const {data,error}=await supa.from('bank_loan_rates').select('disclosure_month').in('disclosure_month',months);
 if(error)throw Error(error.message);
 const have=new Set(data.map(r=>r.disclosure_month));
 months=months.filter(m=>!have.has(m));
}
if(!months.length){console.log('up to date');process.exit(0);}

const banks=bankParams(await get(`${BASE}/loan_household_new.php`));
if(banks.length<10)throw Error(`KFB_BANK_LIST_${banks.length}`);
for(const month of months){
 const [year,mm]=month.split('-');
 const rows=[];
 for(const [opt,loan_kind] of Object.entries(LOAN_KINDS))for(const [nb,basis] of Object.entries(BASES)){
  const endpoint=basis==='new'?'loan_household_new_search_result_new.php':'loan_household_new_search_result_cur.php';
  const body=`year=${year}&month=${mm}&opt_1=${opt}&detail=1&select_new_balance=${nb}&str=${banks.join('|')}`;
  const html=await get(`${BASE}/${endpoint}`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  for(const r of parseRates(html,basis))rows.push({disclosure_month:month,loan_kind,basis,...r,bank_url:BANK_URLS[r.bank_name]??null});
  await sleep(2000);
 }
 if(!rows.length){console.log(`${month}: not published yet`);continue;}
 const unknown=[...new Set(rows.filter(r=>!r.bank_url).map(r=>r.bank_name))];
 if(unknown.length)console.warn(`no homepage for: ${unknown.join(', ')}`);
 // A month is stored whole: replace it so a bank's corrected 제출 also replaces the old values.
 const {error:delError}=await supa.from('bank_loan_rates').delete().eq('disclosure_month',month);
 if(delError)throw Error(delError.message);
 for(let i=0;i<rows.length;i+=500){
  const {error}=await supa.from('bank_loan_rates').insert(rows.slice(i,i+500));
  if(error)throw Error(`DB_${error.code}:${error.message}`);
 }
 console.log(`${month}: ${rows.length} rows`);
}
