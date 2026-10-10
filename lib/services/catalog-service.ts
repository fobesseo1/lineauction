import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";
import { queryCatalog } from "@/lib/catalog-query";
import type { CatalogFilters, CatalogPage } from "@/types/catalog";
import { attachOnbidCovers } from "./onbid-covers";
const cache=new Map<string,{until:number;data:Promise<CatalogPage>}>();
export async function loadCatalogPage(filters:CatalogFilters) {
 const key=JSON.stringify(filters),existing=cache.get(key);if(existing&&existing.until>Date.now())return existing.data;
 const env=getPublicEnv();
 const db=createClient(env.url,env.anonKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,next:{revalidate:180}})}});
 const data=queryCatalog(db,filters).then(async page=>({...page,items:await attachOnbidCovers(page.items)}));
 if(cache.size>=200)cache.delete(cache.keys().next().value!);
 cache.set(key,{until:Date.now()+180000,data});
 try{return await data;}catch(error){cache.delete(key);throw error;}
}
