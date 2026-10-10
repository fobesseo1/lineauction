import {expect,it} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {writeFile} from 'node:fs/promises';
import {queryCatalog} from '@/lib/catalog-query';
import {defaultFilters} from '@/types/catalog';
it.skipIf(process.env.MEASURE_CATALOG!=='1')('compares exact and planner counts on the same anonymous 24-row query',async()=>{
 process.loadEnvFile('.env.local');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
 const results=[];
 for(let round=0;round<3;round++)for(const mode of (round%2?['planned','exact','estimated']:['exact','estimated','planned']) as ('exact'|'planned'|'estimated')[]){
  const start=performance.now();const page=await queryCatalog(db,defaultFilters,undefined,mode);
  expect(page.items).toHaveLength(24);
  results.push({round,mode,milliseconds:performance.now()-start,total:page.total,ids:page.items.map(p=>p.id)});
 }
 expect(new Set(results.map(r=>JSON.stringify(r.ids))).size).toBe(1);
 await writeFile('docs/qa/catalog-count-performance.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({ids,...rest})=>{void ids;return rest;})));
},60000);
