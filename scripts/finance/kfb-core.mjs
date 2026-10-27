// 전국은행연합회 소비자포털 가계대출금리 비교공시 (portal.kfb.or.kr/compare/loan_household_new.php) parsing.

export const LOAN_KINDS={1:'mortgage_amortizing',2:'mortgage_bullet',5:'jeonse'};  // opt_1 → loan_kind
export const BASES={1:'new',2:'balance'};                                         // select_new_balance
export const SCORE_BANDS=['1000-951','950-901','900-851','850-801','800-751','750-701','700-651','650-601','600-','avg'];
const PARTS={'대출금리':'rate','기준금리':'base_rate','가산금리':'spread','가감조정금리':'adjustment'};

// 은행 홈페이지 (금리 화면의 "은행으로 가기" 링크).
export const BANK_URLS={
 '한국산업은행':'https://www.kdb.co.kr','NH농협은행':'https://banking.nonghyup.com','신한은행':'https://www.shinhan.com',
 '우리은행':'https://www.wooribank.com','SC제일은행':'https://www.standardchartered.co.kr','하나은행':'https://www.kebhana.com',
 'IBK기업은행':'https://www.ibk.co.kr','KB국민은행':'https://www.kbstar.com','한국씨티은행':'https://www.citibank.co.kr',
 'Sh수협은행':'https://www.suhyupbank.co.kr','iM뱅크(구 대구은행)':'https://www.imbank.co.kr','BNK부산은행':'https://www.busanbank.co.kr',
 '광주은행':'https://www.kjbank.com','제주은행':'https://www.jejubank.co.kr','전북은행':'https://www.jbbank.co.kr',
 'BNK경남은행':'https://www.knbank.co.kr','케이뱅크':'https://www.kbanking.com','카카오뱅크':'https://www.kakaobank.com','토스뱅크':'https://www.tossbank.com',
};

// The BankName checkbox values on the search page are already EUC-KR percent-encoded; the result endpoint
// takes them joined with '|'.
export function bankParams(pageHtml){
 return [...pageHtml.matchAll(/name=["']?BankName["']?[^>]*value=["']([^"']+)["']/g)].map(m=>m[1]);
}

const text=html=>html.replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const num=s=>{const n=Number(s);return s!==''&&s!=='-'&&Number.isFinite(n)?n:null;};

// Result table → one row per bank × score band (신규취급액) or bank × 'avg' (잔액). Bands with no 대출금리
// (the bank lent nothing there) are left out. An unpublished month returns an empty body → [].
export function parseRates(html,basis){
 const out=[];let bank=null,meta=null,parts=null;
 const flush=()=>{
  if(!bank)return;
  const bands=basis==='new'?SCORE_BANDS:['avg'];
  bands.forEach((band,i)=>{
   const rate=parts.rate?.[i]??null;
   if(rate===null)return;
   out.push({bank_name:bank,score_band:band,rate,base_rate:parts.base_rate?.[i]??null,spread:parts.spread?.[i]??null,adjustment:parts.adjustment?.[i]??null,
    avg_score:band==='avg'?meta.avg_score:null,cb_name:band==='avg'?meta.cb_name:null});
  });
 };
 for(const tr of html.split(/<tr[\s>]/i).slice(1)){
  const cells=[...tr.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)].map(m=>({attrs:m[1],text:text(m[2])}));
  if(!cells.length)continue;
  let i=0;
  if(/rowspan/i.test(cells[0].attrs)&&!PARTS[cells[0].text]){
   flush();
   bank=cells[0].text;parts={};meta={avg_score:null,cb_name:null};i=1;
  }
  if(!bank)continue;
  const part=PARTS[cells[i]?.text];
  if(!part)continue;
  const values=cells.slice(i+1).map(c=>c.text);
  const n=basis==='new'?SCORE_BANDS.length:1;
  parts[part]=values.slice(0,n).map(num);
  if(part==='rate'&&basis==='new'){
   const score=Number(values[n]);meta.avg_score=score>0?score:null;meta.cb_name=values[n+1]||null;
  }
 }
 flush();
 return out;
}
