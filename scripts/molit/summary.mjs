// Pure helpers that turn warehouse trades into market_* summary rows.
export const placeId=(kind,lawd,umd,jibun)=>`${kind}:${lawd}:${umd}:${jibun}`;

// PNU from a 10-digit 법정동 code and a MOLIT 지번 ("236-8", "산69-1", "1050").
export function jibunPnu(bjd,jibun){
 if(!/^\d{10}$/.test(bjd??''))return null;
 const m=String(jibun??'').trim().match(/^(산)?\s*(\d{1,4})(?:-(\d{1,4}))?$/);
 return m?bjd+(m[1]?'2':'1')+m[2].padStart(4,'0')+(m[3]??'0').padStart(4,'0'):null;
}

// Complex names differ in spacing, "아파트" suffixes and brackets between K-APT and MOLIT.
export const normalizeName=n=>String(n??'').replace(/\(.*?\)|\[.*?\]/g,'').replace(/아파트|apt/gi,'').replace(/[\s·.,\-_]/g,'').toLowerCase();

export function median(values){
 if(!values.length)return null;
 const s=[...values].sort((a,b)=>a-b),mid=s.length>>1;
 return s.length%2?s[mid]:Math.round((s[mid-1]+s[mid])/2);
}

// Valid sale = not cancelled and not 직거래 (often a related-party price).
export const validSale=t=>t.deal==='sale'&&!t.cancel_date&&t.dealing!=='직거래'&&t.amount!=null;
export const isJeonse=t=>t.deal==='rent'&&(t.monthly_rent??0)===0&&t.deposit!=null;

// One market_area_stats row from all of a building+area's trades inside the period.
export function areaStats(trades){
 const sales=trades.filter(validSale).sort((a,b)=>a.deal_date.localeCompare(b.deal_date));
 const amounts=sales.map(t=>t.amount);
 const jeonse=trades.filter(isJeonse).map(t=>t.deposit);
 const last=sales.at(-1);
 const saleMedian=median(amounts),jeonseMedian=median(jeonse);
 return {
  sale_count:sales.length,sale_median:saleMedian,
  sale_min:amounts.length?Math.min(...amounts):null,sale_max:amounts.length?Math.max(...amounts):null,
  sale_last_amount:last?.amount??null,sale_last_date:last?.deal_date??null,sale_last_floor:last?.floor??null,
  jeonse_count:jeonse.length,jeonse_median:jeonseMedian,
  wolse_count:trades.filter(t=>t.deal==='rent'&&(t.monthly_rent??0)>0).length,
  jeonse_ratio:saleMedian&&jeonseMedian?Math.round(jeonseMedian/saleMedian*1000)/10:null,
 };
}

// 'YYYY-MM-DD' twelve months before the KST day of `now`.
export function periodStart(now){
 const d=new Date(now.getTime()+9*3600000);d.setUTCFullYear(d.getUTCFullYear()-1);
 return d.toISOString().slice(0,10);
}
