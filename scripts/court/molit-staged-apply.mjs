// Apply only MOLIT transactions/comparisons after the complete photo pass.
import {readFile,writeFile,open,unlink} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
const root='data/court/pipeline';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const targets=await read('data/court/standalone/all-photo-targets-2026-10-09.json');
const results=await read('data/court/standalone/case-repair-all-photos-2026-10-09-results.json');
if(!targets.every(k=>results.items[k]))throw Error('Deferred: photo pass has remaining targets');
try{await readFile('data/court/standalone/running.lock');throw Error('Deferred: photo collector is active');}catch(e){if(e.code!=='ENOENT')throw e;}
const audit=await read('data/court/standalone/case-repair-all-photos-2026-10-09-audit.json');
if(!audit.collectionComplete||audit.counts.verified!==6383)throw Error('Deferred: complete photo audit required');
const stagedReport=await read(`${root}/molit-staged-progress.json`);
if(stagedReport.status!=='staged')throw Error('Deferred: MOLIT matching incomplete');
const photos=await read(`${root}/photos-latest.json`);
if(photos.status!=='completed'||photos.errors?.length)throw Error('Deferred: photo DB sync incomplete');
const lock=await open(`${root}/running.lock`,'wx');
await lock.writeFile(JSON.stringify({pid:process.pid,mode:'molit-staged-apply'}));
const report={startedAt:new Date().toISOString(),comparisons:0,transactions:0,errors:[]};
try{
 process.loadEnvFile('.env.local');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const staged=await read(`${root}/molit-staged.json`),ids=new Map();
 for(let offset=0;;offset+=1000){const {data,error}=await db.from('properties').select('id,source_property_id,auction_condition_id').eq('source','court').order('id').range(offset,offset+999);if(error)throw Error(`Property lookup failed (${error.code})`);for(const p of data)ids.set(`${p.source_property_id}:${p.auction_condition_id}`,p.id);if(data.length<1000)break;}
 const comparisons=staged.comparisons.map(c=>{const id=ids.get(c.property_id);if(!id)throw Error(`Missing persisted property identity: ${c.property_id}`);return {...c,property_id:id};});
 for(const [table,rows] of [['transactions',staged.transactions],['property_comparisons',comparisons]])for(let i=0;i<rows.length;i+=200){const {error}=await db.from(table).upsert(rows.slice(i,i+200),table==='transactions'?{onConflict:'source,source_transaction_id'}:undefined);if(error)throw Error(`${table} write failed (${error.code})`);report[table==='transactions'?'transactions':'comparisons']+=Math.min(200,rows.length-i);}
 for(let i=0;i<comparisons.length;i+=200){const batch=comparisons.slice(i,i+200);const {data,error}=await db.from('property_comparisons').select('property_id').in('property_id',batch.map(c=>c.property_id));if(error||data.length!==new Set(batch.map(c=>c.property_id)).size)throw Error('Comparison DB readback incomplete');}
report.matchedProperties=staged.report.matchedProperties;report.matchedTrades=staged.report.matchedTrades;report.unmatched=staged.report.unmatched+staged.report.properties.skipped;report.skipped=staged.report.properties.skipped;report.status='completed';
}catch(e){report.status='failed';report.errors.push(e.message);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();await writeFile(`${root}/molit-staged-db.json`,JSON.stringify(report,null,2));await lock.close();await unlink(`${root}/running.lock`);console.log(JSON.stringify(report));}
