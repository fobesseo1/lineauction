// Recompute properties.is_current (Onbid: the round open for bidding; court: not yet sold).
// Run after every collector pass so listings never show a past round or a sold 물건.
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const {data,error}=await db.rpc('refresh_current_rounds');
if(error){console.error(error.message);process.exit(1);}
console.log(JSON.stringify({changed:data}));
