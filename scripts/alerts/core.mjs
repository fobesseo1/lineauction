// Pure rules for member alerts (lineestate app.alert_rules / app.watchlist → Telegram).
// send.mjs gathers the rows and state; everything here is testable without the network.
export const SITE=process.env.SITE_URL||'https://lineestate.vercel.app';
export const MAX_ITEMS=10;

// Discounts only count when the screen would show them with confidence: not 참고 시세 (stage 2),
// not "no recent sales" or an appraisal mismatch, and not low confidence.
export function usableDiscount(a){
 if(!a||a.discount_rate==null||!a.confidence||a.confidence==='low')return null;
 if(!/^(median|villa)-/.test(a.market_price_method??''))return null;
 return Number(a.discount_rate);
}

// Still biddable: the sale date (court) or bid end (Onbid) is today or later.
export function isOpen(p,today){
 const d=(p.sale_date??p.bid_end_at??'').slice(0,10);
 return !d||d>=today;
}

const any=list=>Array.isArray(list)&&list.length>0;
export function matchesRule(rule,p,a){
 if(rule.section&&p.section!==rule.section)return false;
 if(any(rule.sources)&&!rule.sources.includes(p.source))return false;
 if(any(rule.sido)&&!rule.sido.includes(p.sido))return false;
 if(any(rule.sigungu)&&!rule.sigungu.includes(p.sigungu))return false;
 if(any(rule.usage_types)&&!rule.usage_types.includes(p.usage_type))return false;
 if(rule.max_minimum_bid!=null&&!(Number(p.minimum_bid_price)<=Number(rule.max_minimum_bid)))return false;
 if(rule.min_failed_bids!=null&&(p.failed_bid_count??0)<rule.min_failed_bids)return false;
 if(rule.min_discount_rate!=null){const d=usableDiscount(a);if(d==null||d<Number(rule.min_discount_rate))return false;}
 return true;
}

// A rule fires again for the same property when its minimum price changes (a 유찰).
export const ruleKey=(rule,p)=>`${rule.id}:${p.id}:${p.minimum_bid_price}`;

// What a watched property looks like for change detection.
export const snapshot=p=>({id:p.id,min:p.minimum_bid_price==null?null:Number(p.minimum_bid_price),failed:p.failed_bid_count??0,result:p.last_result??null});
export function watchChanges(before,now){
 if(!before)return [];
 const out=[];
 if(before.min!==now.min)out.push(`최저가 ${won(before.min)} → ${won(now.min)}`);
 if(before.failed!==now.failed)out.push(`유찰 ${now.failed}회`);
 if(before.result!==now.result&&now.result)out.push(`결과: ${now.result}`);
 return out;
}

export function won(v){
 if(v==null)return '-';
 const n=Number(v);
 if(n>=1e8){const e=n/1e8;return `${e>=10?Math.round(e):Math.round(e*10)/10}억`;}
 return `${Math.round(n/1e4).toLocaleString('ko-KR')}만`;
}
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const shortDate=d=>d?`${Number(d.slice(5,7))}/${Number(d.slice(8,10))}`:null;

export function itemLine(p,a,extra=[]){
 const where=[p.sigungu,p.dong].filter(Boolean).join(' ')||p.address;
 const parts=[`${p.source==='court'?'경매':'공매'} · ${esc(where)} ${esc(p.usage_type??'')}`.trim(),
  `최저가 ${won(p.minimum_bid_price)}${p.appraisal_price?` (감정가 ${won(p.appraisal_price)})`:''}${p.failed_bid_count?` · 유찰 ${p.failed_bid_count}회`:''}`];
 const d=usableDiscount(a);
 if(d!=null)parts.push(d>=0?`실거래 대비 ${Math.round(d)}% 저렴`:`실거래 대비 ${Math.round(-d)}% 비쌈`);
 const date=shortDate((p.sale_date??p.bid_end_at??'').slice(0,10));
 if(date)parts.push(`${p.source==='court'?'매각기일':'입찰 마감'} ${date}`);
 return `• ${parts.join(' · ')}${extra.length?`\n  ${esc(extra.join(' · '))}`:''}\n  ${SITE}/properties/${p.id}`;
}

// One Telegram message (HTML) per heading; long lists are cut with a link to the site.
export function message(heading,lines,moreLink){
 const shown=lines.slice(0,MAX_ITEMS);
 let text=`<b>${esc(heading)}</b>\n\n${shown.join('\n\n')}`;
 if(lines.length>shown.length)text+=`\n\n외 ${lines.length-shown.length}건은 사이트에서 확인하세요: ${moreLink}`;
 return text.slice(0,4000);
}
