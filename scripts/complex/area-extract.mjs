// Streams the 건축HUB 대용량 건축물대장 전유공용면적 zip (one ~44 GB pipe-separated text file) and keeps
// the rows on a complex's lot, plus rows on other lots whose 도로명주소 or 건물명 matches a complex (column
// alt = those kapt codes), as a small TSV for scripts/complex/area-types.mjs.
//   node scripts/complex/area-extract.mjs <zip> [out.tsv]
// The zip is read through Windows tar (bsdtar), which streams zip members without unpacking to disk.
import {createWriteStream} from 'node:fs';
import {mkdir,rename,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {createClient} from '@supabase/supabase-js';
import {exposRow,roadKey,nameKey,EXTRACT_COLUMNS} from './area-core.mjs';
process.loadEnvFile('.env.local');

const [zip,out='data/area-types/expos.tsv']=process.argv.slice(2);
if(!zip){console.error('usage: node scripts/complex/area-extract.mjs <zip> [out.tsv]');process.exit(1);}
const supa=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});

const pnus=new Set(),byRoad=new Map(),byName=new Map();
const add=(map,key,code)=>{if(!key)return;let s=map.get(key);if(!s)map.set(key,s=new Set());s.add(code);};
for(let from=0;;from+=1000){
 const {data,error}=await supa.from('complexes').select('id,kapt_code,name,pnu,bjd_code,road_address').order('id').range(from,from+999);
 if(error)throw Error(error.message);
 for(const c of data){
  if(c.pnu)pnus.add(c.pnu);
  add(byRoad,roadKey(c.road_address),c.kapt_code);
  if(c.bjd_code)add(byName,nameKey(c.bjd_code,c.name),c.kapt_code);
 }
 if(data.length<1000)break;
}
console.log('complex lots',pnus.size,'road keys',byRoad.size,'name keys',byName.size);

await mkdir('data/area-types',{recursive:true});
const tmp=`${out}.part`;
const sink=createWriteStream(tmp);
sink.write(EXTRACT_COLUMNS.join('\t')+'\n');
const tar=spawn(process.env.SystemRoot?`${process.env.SystemRoot}\\System32\\tar.exe`:'tar',['-xOf',zip],{stdio:['ignore','pipe','inherit']});
const lines=createInterface({input:tar.stdout,crlfDelay:Infinity});
let seen=0,kept=0,alt=0;const started=Date.now();
for await(const line of lines){
 seen++;
 if(seen%10_000_000===0)console.log(`${seen/1e6}M rows, kept ${kept} (alt ${alt}), ${Math.round((Date.now()-started)/1000)}s`);
 const row=exposRow(line);
 if(!row)continue;
 if(!pnus.has(row.pnu)){
  const codes=byRoad.get(roadKey(row.road))??byName.get(nameKey(row.bjd,row.building));
  if(!codes)continue;
  row.alt=[...codes].join(',');alt++;
 }
 kept++;
 if(!sink.write(EXTRACT_COLUMNS.map(c=>row[c]).join('\t')+'\n'))await new Promise(r=>sink.once('drain',r));
}
const code=await new Promise(r=>tar.exitCode!==null?r(tar.exitCode):tar.once('close',r));
if(code!==0)throw Error(`TAR_EXIT_${code}`);
await new Promise((r,j)=>sink.end(e=>e?j(e):r()));
await rename(tmp,out);
// 기준월 from the file name, e.g. 국토교통부_건축물대장_전유공용면적+(2026년+09월).zip
const m=zip.match(/(\d{4})년\D*(\d{1,2})월/);
await writeFile(`${out}.meta.json`,JSON.stringify({zip,source_month:m?`${m[1]}-${m[2].padStart(2,'0')}`:null,rows:seen,kept,alt,extracted_at:new Date().toISOString()},null,1));
console.log(`done: ${seen} rows, kept ${kept} (alt ${alt}) → ${out}, ${Math.round((Date.now()-started)/1000)}s`);
