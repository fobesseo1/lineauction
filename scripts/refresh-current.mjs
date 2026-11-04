// Recompute properties.is_current (Onbid: the round open for bidding; court: not yet sold).
// Run after every collector pass so listings never show a past round or a sold 물건.
// A court item missing from the list for 4+ days leaves the current listing; if far more than usual
// would leave that way (a partial or broken court pass), nothing is recomputed and the operator is
// told (--allow-large-delete lets it through). Onbid absences are guarded in onbid/lifecycle-sync.mjs.
import {createClient} from '@supabase/supabase-js';
import {guardDeletes} from './daily/delete-guard.mjs';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const count=q=>q.then(({count,error})=>{if(error)throw Error(error.message);return count??0;});
const {data:latest,error:latestError}=await db.from('properties').select('last_seen_at').eq('source','court').not('last_seen_at','is',null).order('last_seen_at',{ascending:false}).limit(1);
if(latestError){console.error(latestError.message);process.exit(1);}
if(latest[0]){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date());
 const cutoff=new Date(Date.parse(latest[0].last_seen_at)-4*86400_000).toISOString();
 const current=()=>db.from('properties').select('id',{count:'exact',head:true}).eq('source','court').eq('is_current',true);
 const [total,leaving]=await Promise.all([count(current()),count(current().gte('sale_date',today).lt('last_seen_at',cutoff))]);
 await guardDeletes('법원 현재 목록 갱신',[{name:'4일 넘게 목록에 안 보여 빠질 경매 물건',removed:leaving,total}]);
}
const {data,error}=await db.rpc('refresh_current_rounds');
if(error){console.error(error.message);process.exit(1);}
console.log(JSON.stringify({changed:data}));
