// 매물화 신호 for apartment-section buildings → public.sale_signals (see core.mjs for the rules).
//   node scripts/signals/sale-signals.mjs
// Facts: current auctions linked to a building (property_analysis.place_id), 사용승인일 from K-APT
// complexes (market_places.kapt_code), and sale counts per building from the local trade warehouse.
import {DatabaseSync} from 'node:sqlite';
import {createClient} from '@supabase/supabase-js';
import {placeId} from '../molit/summary.mjs';
import {moveInSignal,surgeSignal,auctionSignal,score} from './core.mjs';
process.loadEnvFile('.env.local');

const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const must=({data,error})=>{if(error)throw Error(error.message);return data;};
async function pages(query){const out=[];for(let from=0;;from+=1000){const rows=must(await query().range(from,from+999));out.push(...rows);if(rows.length<1000)return out;}}
const now=new Date();
const day=d=>new Date(now.getTime()+9*3600e3-d*86400e3).toISOString().slice(0,10);

const places=await pages(()=>supa.from('market_places').select('id,kapt_code').order('id'));
const known=new Set(places.map(p=>p.id));
const approved=new Map((await pages(()=>supa.from('complexes').select('kapt_code,approved_on').not('approved_on','is',null).order('kapt_code'))).map(c=>[c.kapt_code,c.approved_on]));

// Current auctions per building.
const auctions=new Map();
for(const r of await pages(()=>supa.from('property_analysis').select('place_id,properties!inner(source,first_seen_at,is_current)').not('place_id','is',null).eq('properties.is_current',true).order('id'))){
 const p=[].concat(r.properties)[0];if(!p)continue;
 if(!auctions.has(r.place_id))auctions.set(r.place_id,[]);auctions.get(r.place_id).push(p);
}

// A listing counts as newly started only once a source has been collected for two weeks.
const freshAfter={};
for(const source of ['court','onbid']){
 const first=must(await supa.from('properties').select('first_seen_at').eq('source',source).order('first_seen_at').limit(1))[0]?.first_seen_at;
 if(first)freshAfter[source]=new Date(new Date(first).getTime()+14*86400e3).toISOString();
}

// Sales per building: last 3 months vs the 12 months before (MOLIT reporting lag makes "recent" an undercount).
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});
const counts=new Map();
for(const r of wh.prepare(`select kind,lawd,umd,jibun,sum(deal_date>=?) recent,sum(deal_date<?) before from trades
  where deal='sale' and kind in ('apt','offi') and cancel_date is null and coalesce(dealing,'')<>'직거래' and deal_date>=? group by kind,lawd,umd,jibun`).iterate(day(91),day(91),day(91+365))){
 counts.set(placeId(r.kind,r.lawd,r.umd,r.jibun),{recent:r.recent,before:r.before});
}

const rows=[],refreshed_at=now.toISOString(),types={};
for(const p of places){
 const c=counts.get(p.id);
 const s=score([auctionSignal(auctions.get(p.id)??[],now,freshAfter),moveInSignal(p.kapt_code?approved.get(p.kapt_code):null,now),c?surgeSignal(c.recent,c.before):null]);
 if(!s.signals.length)continue;
 for(const x of s.signals)types[x.type]=(types[x.type]??0)+1;
 rows.push({place_id:p.id,score:s.score,signals:s.signals,refreshed_at});
}
for(let i=0;i<rows.length;i+=500){const {error}=await supa.from('sale_signals').upsert(rows.slice(i,i+500),{onConflict:'place_id'});if(error)throw Error(error.message);}
// Buildings whose signals ended.
const {error}=await supa.from('sale_signals').delete().lt('refreshed_at',refreshed_at);if(error)throw Error(error.message);
console.log(JSON.stringify({places:places.length,known:known.size,withSignals:rows.length,types,top:rows.filter(r=>r.score>=50).length}));
