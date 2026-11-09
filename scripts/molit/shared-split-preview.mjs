// Before/after numbers for the shared-building split. Reads Supabase and the local warehouse, writes
// only the JSON file named on the command line; nothing goes to the DB.
//   node scripts/molit/shared-split-preview.mjs out.json
import {DatabaseSync} from 'node:sqlite';
import {writeFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
import {areaStats,periodStart} from './summary.mjs';
import {splitTrades,isSaleComplex,rentOwnerAmongAll} from './shared-split.mjs';
process.loadEnvFile('.env.local');
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});
async function all(table,cols,f=q=>q){const out=[];for(let from=0;;from+=1000){const {data,error}=await f(db.from(table).select(cols)).range(from,from+999);if(error)throw Error(`${table}: ${error.message}`);out.push(...data);if(data.length<1000)break;}return out;}
const inChunks=async(table,cols,key,values)=>{const out=[];for(let i=0;i<values.length;i+=200)out.push(...await all(table,cols,q=>q.in(key,values.slice(i,i+200)).order(key)));return out;};

const links=await all('market_place_complexes','place_id,kapt_code,kapt_match',q=>q.order('place_id').order('kapt_code'));
const byPlace=new Map();for(const l of links)(byPlace.get(l.place_id)??byPlace.set(l.place_id,[]).get(l.place_id)).push(l.kapt_code);
const shared=[...byPlace].filter(([id,k])=>k.length>1&&id.startsWith('apt:'));
const codes=[...new Set(shared.flatMap(([,k])=>k))];
const complexes=new Map((await inChunks('complexes','kapt_code,name,sale_type,households,dong_count,sigungu,dong,units_le60,units_le85,units_le135,units_gt135','kapt_code',codes)).map(c=>[c.kapt_code,c]));
const buildings=new Map(),types=new Map();
for(const b of await inChunks('complex_buildings','kapt_code,dong_name,households,main_purpose','kapt_code',codes)){if(!(b.households>0)&&!/아파트/.test(b.main_purpose??''))continue;(buildings.get(b.kapt_code)??buildings.set(b.kapt_code,[]).get(b.kapt_code)).push(b.dong_name);}
for(const t of await inChunks('complex_area_types','kapt_code,exclusive_area,households','kapt_code',codes))(types.get(t.kapt_code)??types.set(t.kapt_code,[]).get(t.kapt_code)).push(Number(t.exclusive_area));

const start=periodStart(new Date());
const d=new Date(Date.now()+9*3600000);d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-35);const from36=d.toISOString().slice(0,10);
const q=wh.prepare(`select key,lawd,umd,jibun,name,area,floor,building,deal,deal_date,amount,deposit,monthly_rent,dealing,cancel_date,contract_type from trades where kind='apt' and lawd=? and umd=? and jibun=? and deal_date>=? and area is not null`);
const areaRow=(trades)=>{const m=new Map();for(const t of trades)(m.get(Math.floor(t.area))??m.set(Math.floor(t.area),[]).get(Math.floor(t.area))).push(t);return [...m].sort((a,b)=>a[0]-b[0]).map(([a,g])=>{const s=areaStats(g);return {area:a,sale:s.sale_count,price:s.sale_median,jeonse:s.jeonse_count,jeonsePrice:s.jeonse_median,wolse:s.wolse_count};}).filter(r=>r.sale||r.jeonse||r.wolse);};
const places=[];
for(const [id,kapts] of shared){
 const [,lawd,umd,jibun]=id.split(':');
 const trades=q.all(lawd,umd,jibun,from36);
 const cs=kapts.map(k=>complexes.get(k)).filter(Boolean);
 const {result,sale,dropped,agree}=splitTrades(cs,trades,buildings,types);
 const methods={};for(const t of trades)if(t.deal==='sale'){const m=result.get(t.key).method;methods[m]=(methods[m]??0)+1;}
 const recent=trades.filter(t=>t.deal_date>=start);
 const rentsRecent=recent.filter(t=>t.deal==='rent');
 const rentResolved=sale.length===1?rentsRecent.filter(t=>rentOwnerAmongAll(t,cs,types)).length:rentsRecent.filter(t=>result.get(t.key).owner).length;
 const rows=cs.map(c=>{
  const mine=t=>{const r=result.get(t.key);if(t.deal==='sale')return isSaleComplex(c)&&(r.owner===c.kapt_code||(sale.length===1&&r.owner));return r.owner===c.kapt_code||r.owner==null;};
  const held=t=>{const r=result.get(t.key);return t.deal==='rent'?r.owner===c.kapt_code:mine(t);};
  const keep=areaRow(recent.filter(mine)),hold=areaRow(recent.filter(held));
  return {kapt_code:c.kapt_code,name:c.name,sale_type:c.sale_type,households:c.households,before:areaRow(recent),after:keep,afterHold:hold};
 });
 places.push({id,saleComplexes:sale.length,complexes:rows,methods,totalSales36:trades.filter(t=>t.deal==='sale').length,rentsRecent:rentsRecent.length,rentResolved,dropped,agree});
}
writeFileSync(process.argv[2],JSON.stringify(places));
wh.close();
console.log(JSON.stringify({places:places.length,complexes:codes.length}));
