// One-off cleanup (2026-11-22): site trade rows whose warehouse key changed when MOLIT filled in a field
// later (aptDong 동), kept as an old row next to the new one by the Sunday --no-delete publish.
//   node scripts/molit/dedupe-twins.mjs            count only (read-only)
//   node scripts/molit/dedupe-twins.mjs --apply    back up to data/backup/molit-dedupe-<day>/ and delete
// A row is deleted only when its id (the part before "~", split buildings) is no longer in the warehouse,
// it is not cancelled, and another row of the same table with the same trade (place, date, area, floor,
// price) IS in the warehouse. Rows gone from the warehouse without such a twin (취소·정정 추정) are only
// counted; the next daily publish removes them as usual.
import {DatabaseSync} from 'node:sqlite';
import {mkdir,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import {createClient} from '@supabase/supabase-js';
process.loadEnvFile('.env.local');

const apply=process.argv.includes('--apply');
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const wh=new DatabaseSync('data/molit/warehouse.sqlite',{readOnly:true});
const keys=new Set(wh.prepare('select key from trades').all().map(r=>r.key));
wh.close();
const base=id=>String(id).split('~')[0];
const num=v=>v==null?null:Number(v);
const TABLES={
 market_trades:{cols:'id,place_id,deal_date,area,floor,amount,cancelled',twin:r=>[r.place_id,r.deal_date,num(r.area),num(r.floor),num(r.amount)]},
 market_rents:{cols:'id,place_id,deal_date,area,floor,deposit,monthly_rent,cancelled',twin:r=>[r.place_id,r.deal_date,num(r.area),num(r.floor),num(r.deposit),num(r.monthly_rent)]},
 market_presale_trades:{cols:'id,lawd,umd,jibun,name,deal_date,area,floor,amount,cancelled',twin:r=>[r.lawd,r.umd,r.jibun,r.name,r.deal_date,num(r.area),num(r.floor),num(r.amount)]},
};
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-','');
const dir=`data/backup/molit-dedupe-${day}`;
const summary={warehouseKeys:keys.size,apply};
for(const [table,{cols,twin}] of Object.entries(TABLES)){
 const rows=[];
 for(let from=0;;from+=1000){
  const {data,error}=await supa.from(table).select(cols).order('id').range(from,from+999);
  if(error)throw Error(`${table}: ${error.message}`);
  rows.push(...data);if(data.length<1000)break;
 }
 const live=new Set(rows.filter(r=>keys.has(base(r.id))).map(r=>JSON.stringify(twin(r))));
 const gone=rows.filter(r=>!keys.has(base(r.id)));
 const dup=gone.filter(r=>live.has(JSON.stringify(twin(r))));
 const del=dup.filter(r=>!r.cancelled);
 const s={rows:rows.length,gone:gone.length,duplicates:dup.length,cancelledDuplicatesKept:dup.length-del.length,vanished:gone.length-dup.length,delete:del.length,places:new Set(del.map(r=>r.place_id??`${r.lawd}|${r.umd}|${r.jibun}`)).size};
 if(apply&&del.length){
  // Full rows first, written to disk before anything is deleted.
  const full=[];
  for(let i=0;i<del.length;i+=200){
   const {data,error}=await supa.from(table).select('*').in('id',del.slice(i,i+200).map(r=>r.id));
   if(error)throw Error(`${table} backup: ${error.message}`);
   full.push(...data);
  }
  if(full.length!==del.length)throw Error(`${table}: backup read ${full.length} of ${del.length}`);
  await mkdir(dir,{recursive:true});
  await writeFile(`${dir}/${table}.json.gz`,gzipSync(JSON.stringify(full)));
  let deleted=0;
  for(let i=0;i<del.length;i+=200){
   const {error,count}=await supa.from(table).delete({count:'exact'}).in('id',del.slice(i,i+200).map(r=>r.id));
   if(error)throw Error(`${table} delete: ${error.message}`);
   deleted+=count??0;
  }
  s.deleted=deleted;s.backup=`${dir}/${table}.json.gz`;
  s.placeIds=[...new Set(full.map(r=>r.place_id).filter(Boolean))];
 }
 summary[table]=s;
 console.log(table,JSON.stringify({...s,placeIds:s.placeIds?.length}));
}
if(apply){await mkdir(dir,{recursive:true});await writeFile(`${dir}/summary.json`,JSON.stringify(summary,null,1));}
