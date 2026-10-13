// 매물화 신호 (apartment section): public facts that make a complex likely to see listings soon.
// Pure scoring so it can be tested; sale-signals.mjs gathers the facts.
//   auction    경매·공매 진행 중 in the complex (개시 within 30 days scores higher)
//   move-in    입주 2년 차 (1세대1주택 비과세 보유 요건) or 4년 차 (전세 2+2 만기), by 사용승인일
//   surge      매매 거래가 평소보다 크게 늘어남 (last 3 months vs the 12 months before, per month)
// Scores add up to at most 100. Wording says "매물화 가능성", never "매도 예정".

const monthsBetween=(from,to)=>(to.getUTCFullYear()-from.getUTCFullYear())*12+(to.getUTCMonth()-from.getUTCMonth());

export function moveInSignal(approvedOn,now){
 if(!approvedOn)return null;
 const m=monthsBetween(new Date(`${String(approvedOn).slice(0,10)}T00:00:00Z`),now);
 if(m>=22&&m<=26)return {type:'move-in-2y',score:25,label:'입주 2년 차',detail:`사용승인 ${String(approvedOn).slice(0,7)} · 1세대1주택 비과세 보유 요건(2년)을 채우는 시기`};
 if(m>=46&&m<=50)return {type:'move-in-4y',score:25,label:'입주 4년 차',detail:`사용승인 ${String(approvedOn).slice(0,7)} · 입주 때 맺은 전세(2+2년)가 끝나는 시기`};
 return null;
}

// recent = sales in the last 3 months, before = sales in the 12 months before that.
export function surgeSignal(recent,before){
 const usual=before/4; // per 3 months
 if(recent<3||recent<usual*2)return null;
 const ratio=usual>0?recent/usual:null;
 const strong=ratio==null||ratio>=3;
 return {type:'surge',score:strong?30:20,label:'거래 급증',
  detail:ratio==null?`최근 3개월 매매 ${recent}건 (그 전 1년은 거래 없음)`:`최근 3개월 매매 ${recent}건 · 평소의 ${Math.round(ratio*10)/10}배`};
}

// freshAfter: {court, onbid} ISO times. Items first seen in a source's initial backfill are not
// "new" even though our first_seen_at is recent.
export function auctionSignal(items,now,freshAfter={}){
 if(!items.length)return null;
 const fresh=items.filter(i=>i.first_seen_at&&now-new Date(i.first_seen_at)<=30*86400e3&&(!freshAfter[i.source]||i.first_seen_at>freshAfter[i.source])).length;
 const court=items.filter(i=>i.source==='court').length,onbid=items.length-court;
 const kinds=[court&&`경매 ${court}건`,onbid&&`공매 ${onbid}건`].filter(Boolean).join(' · ');
 return {type:'auction',score:fresh?35:25,label:fresh?'경매·공매 새로 시작':'경매·공매 진행 중',
  detail:`${kinds} 진행 중${fresh?` (최근 30일 시작 ${fresh}건)`:''} · 낙찰 전에 일반 매매로 정리하려는 경우가 있음`};
}

export function score(signals){
 const list=signals.filter(Boolean).sort((a,b)=>b.score-a.score);
 return {score:Math.min(100,list.reduce((s,x)=>s+x.score,0)),signals:list};
}
