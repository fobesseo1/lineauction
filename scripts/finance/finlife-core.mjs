// 금융감독원 금융상품한눈에 공개 API (finlife.fss.or.kr/finlifeapi) → loan_products rows.

export const FIN_GROUPS={'020000':'은행','030300':'저축은행','050000':'보험','030200':'여신전문','060000':'금융투자'};
export const APIS={mortgage:'mortgageLoanProductsSearch',jeonse:'rentHouseLoanProductsSearch'};
// Companies whose companySearch entry has no homp_url (2026-10).
export const HOMEPAGE_FALLBACK={'0010016':'https://www.imbank.co.kr'};  // 아이엠뱅크

const rate=x=>x===null||x===undefined||x===''?null:Number(x);
const month=m=>/^\d{6}$/.test(m??'')?`${m.slice(0,4)}-${m.slice(4)}`:null;

// One API answer (baseList + optionList) → one row per option, joined to its product and the company homepage.
export function productRows(kind,group,result,homepages){
 const products=new Map(result.baseList.map(b=>[`${b.fin_co_no}|${b.fin_prdt_cd}`,b]));
 const out=[];
 for(const o of result.optionList){
  const b=products.get(`${o.fin_co_no}|${o.fin_prdt_cd}`);
  if(!b)continue;
  out.push({
   product_kind:kind,fin_group:FIN_GROUPS[group]??group,fin_co_code:b.fin_co_no,fin_co_name:b.kor_co_nm.trim(),
   homepage_url:homepages.get(b.fin_co_no)??null,product_code:b.fin_prdt_cd,product_name:b.fin_prdt_nm.trim(),
   collateral_type:kind==='mortgage'?(o.mrtg_type_nm??'').trim():'',repayment_type:(o.rpay_type_nm??'').trim(),rate_type:(o.lend_rate_type_nm??'').trim(),
   rate_min:rate(o.lend_rate_min),rate_max:rate(o.lend_rate_max),rate_avg:rate(o.lend_rate_avg),
   loan_limit:b.loan_lmt?.trim()||null,join_way:b.join_way?.trim()||null,disclosure_month:month(o.dcls_month??b.dcls_month),
  });
 }
 return out;
}

export const rowKey=r=>[r.product_kind,r.fin_co_code,r.product_code,r.collateral_type,r.repayment_type,r.rate_type].join('|');
// Fields whose change is worth a write (fetched_on alone is not).
const CONTENT=['fin_group','fin_co_name','homepage_url','product_name','rate_min','rate_max','rate_avg','loan_limit','join_way','disclosure_month'];
// The DB returns numeric columns as strings ("5.39"), so rates compare as numbers.
const norm=(k,v)=>v==null?'':k.startsWith('rate_')?String(Number(v)):String(v);
export function changed(stored,fresh){
 return CONTENT.some(k=>norm(k,stored[k])!==norm(k,fresh[k]));
}
