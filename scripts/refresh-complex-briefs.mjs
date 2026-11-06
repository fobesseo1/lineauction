// Recompute lineestate's complex summary table (app.complex_briefs) after app.region_pyeong_price and the
// complex-detail tables are fresh. The function belongs to lineestate's app schema; this only calls it.
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const started=Date.now();
const {data,error}=await db.schema('app').rpc('refresh_complex_briefs');
if(error){console.error(error.message);process.exit(1);}
console.log(JSON.stringify({result:data??null,seconds:Math.round((Date.now()-started)/1000)}));
