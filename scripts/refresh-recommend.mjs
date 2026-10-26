// Rebuild lineestate's recommendation table (app.recommend_base, a materialized view refreshed
// concurrently, so pages keep reading it) after the complex, station, commute and school passes.
// The function belongs to lineestate's app schema; this only calls it.
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const started=Date.now();
const {data,error}=await db.schema('app').rpc('refresh_recommend_base');
if(error){console.error(error.message);process.exit(1);}
console.log(JSON.stringify({result:data??null,seconds:Math.round((Date.now()-started)/1000)}));
