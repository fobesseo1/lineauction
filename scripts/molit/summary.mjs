// Pure helpers that turn warehouse trades into market_* summary rows.
export const placeId=(kind,lawd,umd,jibun)=>`${kind}:${lawd}:${umd}:${jibun}`;

// PNU from a 10-digit 법정동 code and a MOLIT 지번 ("236-8", "산69-1", "1050").
export function jibunPnu(bjd,jibun){
 if(!/^\d{10}$/.test(bjd??''))return null;
 const m=String(jibun??'').trim().match(/^(산)?\s*(\d{1,4})(?:-(\d{1,4}))?$/);
 return m?bjd+(m[1]?'2':'1')+m[2].padStart(4,'0')+(m[3]??'0').padStart(4,'0'):null;
}

// Brand spellings K-APT and MOLIT use for the same name ("SKVIEW" = "에스케이뷰" = "SK뷰"),
// applied after lowercasing and in this order (longer forms first).
const BRANDS=[
 [/skview|에스케이뷰|sk뷰/g,'sk뷰'],[/에스케이|sk/g,'sk'],
 [/ipark|아이파크/g,'아이파크'],[/이편한세상|e편한세상|e-편한세상/g,'e편한세상'],
 [/prugio|푸르지오/g,'푸르지오'],[/xi|자이/g,'자이'],[/thesharp|the#|더#|더샵/g,'더샵'],
 [/hillstate|힐스테이트/g,'힐스테이트'],[/raemian|래미안/g,'래미안'],[/lottecastle|롯데캐슬/g,'롯데캐슬'],
 [/s클래스|에스클래스/g,'s클래스'],[/엘에이치|lh/g,'lh'],[/케이씨씨|kcc/g,'kcc'],[/지에스|gs/g,'gs'],
 [/dmc|디엠씨/g,'dmc'],[/위브|weve/g,'위브'],[/센트럴|central/g,'센트럴'],
 [/park/g,'파크'],[/view/g,'뷰'],[/city/g,'시티'],[/맨숀/g,'맨션'],
];
// Complex names differ in spacing, "아파트" suffixes, brackets and brand spellings between K-APT and MOLIT.
export const normalizeName=n=>BRANDS.reduce((s,[re,to])=>s.replace(re,to),
 String(n??'').replace(/\(.*?\)|\[.*?\]/g,'').replace(/아파트|apt/gi,'').replace(/[\s·.,\-_&]/g,'').toLowerCase());

// 차수/단지 numbers in a name, brackets included: "신창비바패밀리1,2단지" → [1,2], "영덕신일1" → [1].
export function nameOrdinals(name){
 const s=String(name??'');
 const out=new Set();
 for(const m of s.matchAll(/(\d+(?:\s*,\s*\d+)*)\s*(?:차|단지)/g))m[1].split(',').forEach(n=>out.add(Number(n)));
 const tail=s.replace(/\(.*?\)|\[.*?\]/g,'').replace(/아파트|apt/gi,'').trim().match(/(\d+)$/);
 if(tail)out.add(Number(tail[1]));
 return out;
}

// A MOLIT building name and a K-APT complex name that differ only by a region prefix or suffix
// ("한솔솔파크(501,502동)" ~ "당정한솔솔파크", "DMC파크뷰자이1단지" ~ "DMC파크뷰자이아파트").
// The shorter name must sit inside the longer one (3+ characters, not cut before a digit), and
// 차수/단지 numbers must agree; a number on one side only is accepted only when it is 1.
export function similarName(a,b){
 const x=normalizeName(a),y=normalizeName(b);
 const [s,l]=x.length<=y.length?[x,y]:[y,x];
 if(s.length<3)return false;
 const i=l.indexOf(s);
 if(i<0||(/\d$/.test(s)&&/\d/.test(l[i+s.length]??'')))return false;
 const na=nameOrdinals(a),nb=nameOrdinals(b);
 if(na.size&&nb.size)return [...na].some(n=>nb.has(n));
 const one=na.size?na:nb;
 return !one.size||(one.size===1&&one.has(1));
}

// MOLIT often files several complexes on one lot under a combined name ("한국1,동아,팬더",
// "양지마을(6단지)(금호,청구)", "태산,대진.정광아파트"). For a building on the complex's own spot,
// a 2+ character part of that name (numbers and generic words dropped) found in the complex name
// is enough: "갈산 팬더 아파트" ~ "한국1,동아,팬더", "하계한신" ~ "한신1".
const GENERIC=new Set(['마을','주공','시영','단지','아파트','타운','빌라','맨션','파크','하이츠','그린','e편한세상','자이','푸르지오','래미안','아이파크','더샵','힐스테이트','롯데캐슬','위브','lh']);
export function sharesNamePart(molitName,complexName){
 const target=normalizeName(complexName);
 return String(molitName??'').split(/[,.()[\]·\s]+/).map(p=>normalizeName(p).replace(/\d+(차|단지|동)?/g,''))
  .some(p=>p.length>=2&&!GENERIC.has(p)&&!/마을$/.test(p)&&target.includes(p));   // "양지마을" names a neighbourhood, not a complex
}

// Hand-checked building ↔ complex pairs (manual-place-links.json) that the lot and name rules miss.
// 'primary' makes it the building's own complex, replacing whatever a rule picked; 'also' adds a link
// and leaves the building's own complex as it is. Buildings no longer in the warehouse are listed.
export function applyManualLinks(places,manual){
 const extra=[],missing=[];
 for(const m of manual){
  const p=places.get(m.place_id);
  if(!p){missing.push(m.place_id);continue;}
  if(m.action==='primary')Object.assign(p,{kapt_code:m.kapt_code,kapt_match:'manual'});
  else extra.push({place_id:m.place_id,kapt_code:m.kapt_code,kapt_match:'manual'});
 }
 return {extra,missing};
}

// 수도권 apartment complexes with no building link and not yet confirmed as having none.
const CAPITAL=new Set(['서울특별시','경기도','인천광역시']);
export const newUnlinked=(complexes,linked,confirmed)=>complexes.filter(c=>c.section==='apartment'&&CAPITAL.has(c.sido)&&!linked.has(c.kapt_code)&&!confirmed.has(c.kapt_code));

export function median(values){
 if(!values.length)return null;
 const s=[...values].sort((a,b)=>a-b),mid=s.length>>1;
 return s.length%2?s[mid]:Math.round((s[mid-1]+s[mid])/2);
}

// Valid sale = not cancelled and not 직거래 (often a related-party price).
export const validSale=t=>t.deal==='sale'&&!t.cancel_date&&t.dealing!=='직거래'&&t.amount!=null;
export const isJeonse=t=>t.deal==='rent'&&(t.monthly_rent??0)===0&&t.deposit!=null;
const isNewJeonse=t=>isJeonse(t)&&t.contract_type==='신규';
const MIN_NEW_JEONSE=3;
// Renewals (갱신) and public-rental deals drag a jeonse median far below the market, so a building+area
// is priced from its new contracts when it has enough of them; otherwise ('all') from every contract.
// A blank contract_type does not count as new.
export const jeonseBasis=trades=>trades.filter(isNewJeonse).length>=MIN_NEW_JEONSE?'new':'all';

// One market_area_stats row from all of a building+area's trades inside the period.
export function areaStats(trades){
 const sales=trades.filter(validSale).sort((a,b)=>a.deal_date.localeCompare(b.deal_date));
 const amounts=sales.map(t=>t.amount);
 const basis=jeonseBasis(trades);
 const jeonse=trades.filter(basis==='new'?isNewJeonse:isJeonse).map(t=>t.deposit);
 const wolse=trades.filter(t=>t.deal==='rent'&&(t.monthly_rent??0)>0);
 const last=sales.at(-1);
 const saleMedian=median(amounts),jeonseMedian=median(jeonse);
 return {
  sale_count:sales.length,sale_median:saleMedian,
  sale_min:amounts.length?Math.min(...amounts):null,sale_max:amounts.length?Math.max(...amounts):null,
  sale_last_amount:last?.amount??null,sale_last_date:last?.deal_date??null,sale_last_floor:last?.floor??null,
  jeonse_count:jeonse.length,jeonse_median:jeonseMedian,jeonse_basis:basis,
  // 월세 보증금·월세 medians (만원) feed the price calculator's income approach.
  wolse_count:wolse.length,wolse_deposit_median:median(wolse.map(t=>t.deposit??0)),wolse_rent_median:median(wolse.map(t=>t.monthly_rent)),
  jeonse_ratio:saleMedian&&jeonseMedian?Math.round(jeonseMedian/saleMedian*1000)/10:null,
 };
}

// 'YYYY-MM-DD' twelve months before the KST day of `now`.
export function periodStart(now){
 const d=new Date(now.getTime()+9*3600000);d.setUTCFullYear(d.getUTCFullYear()-1);
 return d.toISOString().slice(0,10);
}

// Month-by-month medians for a price chart, stored sparsely to keep the free-tier DB small:
//   {"from":"2023-11","sale":"0:201000:3,1:192500:5","jeonse":"2:110000:4"}
// Each entry is <month index from "from">:<median 만원>:<count>; months without trades are left out.
// basis is the building+area's 12-month jeonse_basis; one basis for every month keeps the line from
// jumping between new-contract and renewal prices.
export function monthlyHistory(trades,months,basis='all'){
 const countsAsJeonse=basis==='new'?isNewJeonse:isJeonse;
 const index=new Map(months.map((m,i)=>[m,i]));
 const sale=months.map(()=>[]),jeonse=months.map(()=>[]);
 for(const t of trades){
  const i=index.get(t.deal_date?.slice(0,7));if(i===undefined)continue;
  if(validSale(t))sale[i].push(t.amount);else if(countsAsJeonse(t))jeonse[i].push(t.deposit);
 }
 const pack=lists=>lists.map((v,i)=>v.length?`${i}:${median(v)}:${v.length}`:null).filter(Boolean).join(',');
 return {from:months[0],sale:pack(sale),jeonse:pack(jeonse)};
}
