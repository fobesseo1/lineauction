import { expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { queryCatalog } from "@/lib/catalog-query";
import { defaultFilters } from "@/types/catalog";
import { writeFile, mkdir } from "node:fs/promises";
import {renderToString} from 'react-dom/server';
import {createElement} from 'react';
import {PagedCatalog} from '@/components/property/paged-catalog';
it.skipIf(process.env.MEASURE_CATALOG !== '1')('measures anonymous DB pages without reading the website or invoking collectors',async()=>{
 process.loadEnvFile('.env.local');
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});
 const results=[];
 for(const variant of [{source:'court' as const},{source:'onbid' as const},{source:'court' as const,q:'2025타경101619'},{source:'court' as const,sort:'price' as const},{source:'court' as const,offset:24}]){
  const filters={...defaultFilters,...variant},start=performance.now();const page=await queryCatalog(db,filters);const milliseconds=performance.now()-start;
  expect(page.items.length).toBeLessThanOrEqual(24);if(!filters.q)expect(page.items.length).toBe(24);
  if(filters.sort==='price')expect(page.items.map(p=>BigInt(p.minimum_bid_price??'0'))).toEqual(page.items.map(p=>BigInt(p.minimum_bid_price??'0')).sort((a,b)=>a<b?-1:a>b?1:0));
  const markup=renderToString(createElement(PagedCatalog,{initialPage:page,initialFilters:filters}));
  expect(Buffer.byteLength(markup)).toBeLessThan(200000);
  results.push({filters,rows:page.items.length,total:page.total,bytes:Buffer.byteLength(JSON.stringify(page)),renderedComponentBytes:Buffer.byteLength(markup),milliseconds});
 }
 await mkdir('docs/qa',{recursive:true});await writeFile('docs/qa/catalog-performance.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results));
},60000);
