import { expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { queryCatalog } from '@/lib/catalog-query';
import { defaultFilters } from '@/types/catalog';
import { getDemoProperties } from '@/lib/demo/data';

it.each(['court','onbid','all'] as const)('%s looks up covers only for the returned page and uses the first ordered photo', async (source) => {
 const property = {...getDemoProperties()[0], source:source==='all'?'onbid':source, lifecycle:null};
 const calls:{table:string;method:string;args:unknown[]}[]=[];
 const db={from(table:string){
  const result=table==='properties'?{data:[property],count:49,error:null}:{data:[{property_id:property.id,path:'/first.webp'},{property_id:property.id,path:'/second.webp'}],error:null};
  const chain=new Proxy({}, {get(_target,method:string){
   if(method==='then')return Promise.resolve(result).then.bind(Promise.resolve(result));
   return (...args:unknown[])=>{calls.push({table,method,args});return chain;};
  }});
  return chain;
 }} as unknown as SupabaseClient;
 const page=await queryCatalog(db,{...defaultFilters,source});
 expect(page.items[0].cover_image).toBe('/first.webp');
 expect(page.nextOffset).toBe(24);
 expect(calls.find(c=>c.table==='properties'&&c.method==='select')?.args[0]).not.toContain('property_media');
 expect(calls.find(c=>c.table==='properties'&&c.method==='range')?.args).toEqual([0,23]);
 expect(calls.find(c=>c.table==='property_media'&&c.method==='in')?.args).toEqual(['property_id',[property.id]]);
});

it('does not request photos when search returns no properties', async()=>{
 let fromCalls=0;
 const chain=new Proxy({}, {get(_target,method:string){
  if(method==='then')return Promise.resolve({data:[],count:0,error:null}).then.bind(Promise.resolve({data:[],count:0,error:null}));
  return ()=>chain;
 }});
 const db={from(){fromCalls++;return chain;}} as unknown as SupabaseClient;
 expect(await queryCatalog(db,{...defaultFilters,q:'no match'})).toEqual({items:[],total:0,nextOffset:null});
 expect(fromCalls).toBe(1);
});
