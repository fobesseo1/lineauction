// K-apt 임대·혼합 단지 파일 → public.complex_rental_types. Safe to run again.
//   node scripts/complex/rental-types.mjs <csv path> [--date 2026-11-06] [--dry-run]
// The date comes from 20261106 in the file name unless --date says otherwise. Rows missing from the new file are
// deleted (the complex is no longer 임대·혼합), and replaceRows stops if that would remove over 30% of the table.
// Any bad line stops the run before writing. An older file than the one loaded is refused.
import {readFile} from 'node:fs/promises';
import {arg,db,flag,replaceRows} from '../detail/common.mjs';
import {dateFromName,rentalRows} from './rental-core.mjs';

const path=process.argv[2];
if(!path||path.startsWith('--')){console.error('usage: node scripts/complex/rental-types.mjs <csv path> [--date YYYY-MM-DD] [--dry-run]');process.exit(1);}
const sourceDate=arg('--date',null)??dateFromName(path);
if(!/^\d{4}-\d{2}-\d{2}$/.test(sourceDate??'')){console.error('NO_SOURCE_DATE: put 20261106 in the file name or pass --date');process.exit(1);}

const {rows,errors,flagged}=rentalRows(await readFile(path,'utf8'),sourceDate);
const count=type=>rows.filter(r=>r.sale_type===type).length;
console.log(JSON.stringify({file:path,sourceDate,rows:rows.length,임대:count('임대'),혼합:count('혼합'),flagged:flagged.length,errors:errors.length}));
if(flagged.length)console.log(['임대세대수 > 세대수 (세대 구분은 null):',...flagged].join('\n'));
if(errors.length){console.error(errors.slice(0,50).join('\n'));process.exit(1);}
if(flag('--dry-run'))process.exit(0);

const {data:latest,error}=await db.from('complex_rental_types').select('source_date').order('source_date',{ascending:false}).limit(1);
if(error)throw Error(error.message);
if(latest[0]&&latest[0].source_date>sourceDate){console.error(`OLDER_FILE: table has ${latest[0].source_date}`);process.exit(1);}

await replaceRows('complex_rental_types',rows.map(r=>({...r,loaded_at:new Date().toISOString()})),['kapt_code']);
const {count:total,error:countError}=await db.from('complex_rental_types').select('kapt_code',{count:'exact',head:true});
if(countError)throw Error(countError.message);
console.log(JSON.stringify({loaded:rows.length,tableRows:total}));
