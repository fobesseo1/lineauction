// 전월세 전환율 per 시군구 from our own trades → public.calc_constants (price calculator, income approach).
//   node scripts/molit/conversion-rate.mjs
// For each building + 평형 with both 전세 and 월세 in the last 12 months:
//   rate = 월세 × 12 ÷ (전세 중앙값 − 월세 보증금 중앙값) × 100
// and the 시군구 rate is the median of those (10+ buildings, else not published).
// Keys: conversion_rate.apt / .offi / .rh, value {lawd(5 digits): rate %}.
import {DatabaseSync} from 'node:sqlite';
import {createClient} from '@supabase/supabase-js';
import {median,periodStart,isJeonse} from './summary.mjs';
process.loadEnvFile('.env.local');

export const MIN_GROUPS=10;
// One building + 평형's implied rate, or null when the inputs can't support one.
export function groupRate(trades){
 const jeonse=median(trades.filter(isJeonse).map(t=>t.deposit));
 const wolse=trades.filter(t=>t.deal==='rent'&&(t.monthly_rent??0)>0);
 if(!jeonse||!wolse.length)return null;
 const deposit=median(wolse.map(t=>t.deposit??0)),rent=median(wolse.map(t=>t.monthly_rent));
 // A deposit close to the 전세 price makes the rate explode; require a real gap.
 if(jeonse-deposit<jeonse*0.2)return null;
 const rate=rent*12/(jeonse-deposit)*100;
 return rate>0.5&&rate<20?rate:null;
}

if(import.meta.url===`file:///${process.argv[1].replace(/\\/g,'/')}`){
 const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});
 const since=periodStart(new Date());
 const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
 const rows=[];
 for(const kind of ['apt','offi','rh']){
  const groups=new Map();
  for(const t of wh.prepare(`select lawd,umd,jibun,area,deal,deposit,monthly_rent from trades where kind=? and deal='rent' and deal_date>=? and area>0`).iterate(kind,since)){
   const k=`${t.lawd}|${t.umd}|${t.jibun}|${Math.floor(t.area)}`;
   if(!groups.has(k))groups.set(k,[]);groups.get(k).push(t);
  }
  const byLawd=new Map();
  for(const [k,list] of groups){const r=groupRate(list);if(r==null)continue;const lawd=k.slice(0,5);if(!byLawd.has(lawd))byLawd.set(lawd,[]);byLawd.get(lawd).push(r);}
  const value={};
  for(const [lawd,rates] of [...byLawd].sort())if(rates.length>=MIN_GROUPS)value[lawd]=Math.round(median(rates.map(r=>r*100))/10)/10;
  const all=[...byLawd.values()].flat();
  value.all=Math.round(median(all.map(r=>r*100))/10)/10;
  rows.push({key:`conversion_rate.${kind}`,value,unit:'%',as_of:new Date().toISOString().slice(0,10),
   source:'선자산 계산 (국토교통부 실거래가 공개시스템 전월세 자료)',source_url:null,
   note:`최근 12개월, 같은 건물·평형의 월세×12 ÷ (전세 중앙값 − 월세 보증금 중앙값). 시군구별 ${MIN_GROUPS}개 건물 이상만, all은 수도권 전체`,
   updated_at:new Date().toISOString()});
  console.log(kind,'lawds',Object.keys(value).length-1,'all',value.all,'groups',all.length);
 }
 const {error}=await supa.from('calc_constants').upsert(rows,{onConflict:'key'});
 if(error)throw Error(error.message);
 console.log('DONE');
}
