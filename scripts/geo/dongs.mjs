// Build the capital-area 법정동 table: MOLIT 시군구 code + umdNm → 10-digit 법정동 code.
//   node scripts/geo/dongs.mjs
// Dongs come from LT_C_ADEMD_INFO (8-digit emd_cd + "00"); 리 from LT_C_ADRI_INFO (10-digit li_cd),
// keyed "읍 리" the way MOLIT writes rural umdNm. Output: data/geo/dongs.json.
import {mkdir} from 'node:fs/promises';
import {writeJson} from '../onbid/atomic.mjs';
import {regionCatalog} from '../court/regions.mjs';
import {leafRegions} from '../molit/core.mjs';
import {allFeatures} from './vworld.mjs';
process.loadEnvFile('.env.local');

await mkdir('data/geo',{recursive:true});
const table={};let dongs=0,ris=0;
for(const {code} of leafRegions(regionCatalog.codes)){
 const map=table[code]={};
 for(const f of await allFeatures('LT_C_ADEMD_INFO',{attrFilter:`emd_cd:like:${code}`,geometry:'false'})){
  const p=f.properties;if(!p.emd_cd?.startsWith(code))continue;
  map[p.emd_kor_nm]=`${p.emd_cd}00`;dongs++;
 }
 for(const f of await allFeatures('LT_C_ADRI_INFO',{attrFilter:`li_cd:like:${code}`,geometry:'false'})){
  const p=f.properties;if(!p.li_cd?.startsWith(code))continue;
  const parts=String(p.full_nm).split(' ');map[parts.slice(-2).join(' ')]=p.li_cd;ris++;
 }
}
await writeJson('data/geo/dongs.json',{builtAt:new Date().toISOString(),source:'국토교통부 브이월드 LT_C_ADEMD_INFO, LT_C_ADRI_INFO',table});
console.log(`regions ${Object.keys(table).length}, dongs ${dongs}, ri ${ris}`);
