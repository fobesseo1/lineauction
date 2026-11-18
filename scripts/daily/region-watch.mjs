// Daily region baseline (lineestate app.region_watch, migration 20261118180000; docs/metro-expansion-plan.md).
// Records per-시도 counts and a content fingerprint of every complex (no timestamps, coordinates rounded),
// compares them with the previous day, and returns only changes nobody can explain: fewer complexes or
// places, complexes gone, more than 1% of existing complexes changed, trades or rents down more than 1%,
// recommendation rows down more than 3%, stations or schools down. Any alert fails the step (so the
// morning report says 일부 실패) and goes to the operator chat once.
//   node scripts/daily/region-watch.mjs [--dry]
import {createClient} from '@supabase/supabase-js';
import {sendMessage} from '../alerts/telegram.mjs';
process.loadEnvFile('.env.local');

const dry=process.argv.includes('--dry');
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

export function watchMessage(alerts){
 const n=v=>v==null?'':Number(v).toLocaleString('ko-KR');
 return alerts.slice(0,30).map(a=>`• ${a.sido==='*'?'전체':a.sido}: ${a.what}${a.from!=null?` ${n(a.from)} → ${n(a.to)}`:a.to!=null?` ${n(a.to)}${a.of!=null?` / ${n(a.of)}`:''}`:''}`).join('\n')+(alerts.length>30?`\n외 ${alerts.length-30}건`:'');
}

if(String(process.argv[1]??'').replace(/\\/g,'/').endsWith('scripts/daily/region-watch.mjs')){
 if(dry){console.log(JSON.stringify({dry:true,note:'region_watch writes the day\'s record; run without --dry from the daily job'}));process.exit(0);}
 const {data,error}=await supa.schema('app').rpc('region_watch');
 if(error)throw Error(`region_watch: ${error.message}`);
 const alerts=data?.alerts??[];
 if(alerts.length){
  console.error(watchMessage(alerts));
  if(process.env.TELEGRAM_CHAT_ID&&process.env.TELEGRAM_BOT_TOKEN){
   const r=await sendMessage(process.env.TELEGRAM_CHAT_ID,`<b>지역 기준값: 어제와 다른 점 ${alerts.length}건</b>\n${watchMessage(alerts).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c])}`);
   if(!r.ok)console.error('telegram failed',r.description);
  }
 }
 const today=data?.today??{};
 console.log(JSON.stringify({day:data?.day,prev:data?.prev,sido:Object.keys(today).filter(k=>k!=='*').length,alerts:alerts.length}));
 process.exit(alerts.length?1:0);
}
