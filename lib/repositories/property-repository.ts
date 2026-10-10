import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicDetailClient as createClient } from "@/lib/supabase/public-detail";
import { createClient as createPublicClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";
import {
  propertyInputSchema,
  propertySchema,
  type PropertyInput,
} from "@/types/property";
const outcomeSchema = z.enum(["created", "updated", "unchanged", "stale"]);
export async function upsertProperty(input: PropertyInput, checkedAt: string) {
  const validated = propertyInputSchema.parse(input);
  const { data, error } = await createAdminClient().rpc(
    "upsert_auction_property",
    { p_input: validated, p_checked_at: checkedAt },
  );
  if (error) throw new Error("Property persistence failed");
  return outcomeSchema.parse(data);
}
type PropertyPage = z.infer<typeof propertySchema>[];
const publicLists = new Map<string,{expires:number;pending:Promise<PropertyPage>}>();
export async function listProperties(source?: 'court'|'onbid') {
  const key=source??'all',cached=publicLists.get(key);
  if(cached&&cached.expires>Date.now())return cached.pending;
  // Cache only anonymous public catalog reads, never authenticated or raw observations.
  const env=getPublicEnv();
  const client=createPublicClient(env.url,env.anonKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const load=async()=>{
    const fetchPage=async(offset:number,count=false)=>{
      let query=client.from('properties_catalog').select('*',count?{count:'exact'}:{});
      if(source)query=query.eq('source',source);
      const result=await query.order('last_seen_at',{ascending:false}).order('id').range(offset,offset+999);
      if(result.error)throw new Error('Property query failed');
      return {rows:z.array(propertySchema).parse(result.data),total:result.count};
    };
    const first=await fetchPage(0,true),rows=[...first.rows];
    if(first.total===null)throw new Error('Property count unavailable');
    // Four reads at a time; pages retain the same stable sort order.
    for(let offset=1000;offset<first.total;offset+=4000){
      const offsets=Array.from({length:4},(_,i)=>offset+i*1000).filter(n=>n<first.total!);
      const pages=await Promise.all(offsets.map(n=>fetchPage(n)));
      pages.forEach(page=>rows.push(...page.rows));
    }
    return rows;
  };
  const pending=load();const entry={expires:Infinity,pending};publicLists.set(key,entry);
  try{const result=await pending;entry.expires=Date.now()+30000;return result;}
  catch(error){if(publicLists.get(key)===entry)publicLists.delete(key);throw error;}
}
export async function findProperty(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await (
    await createClient()
  )
    .from("properties_catalog")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error("Property query failed");
  return data ? propertySchema.parse(data) : null;
}
export const historySchema = z.object({
  id: z.string(),
  minimum_bid_price: z.string().nullable(),
  appraisal_price: z.string().nullable(),
  failed_bid_count: z.number().nullable(),
  status: z.string().nullable(),
  bid_start_at: z.string().nullable(),
  bid_end_at: z.string().nullable(),
  checked_at: z.string(),
});
export async function listPriceHistory(id: string) {
  const { data, error } = await (
    await createClient()
  )
    .from("property_history_public")
    .select("*")
    .eq("property_id", id)
    .order("checked_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("History query failed");
  return z.array(historySchema).parse(data);
}
