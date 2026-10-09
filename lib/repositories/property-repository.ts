import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
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
export async function listProperties() {
  const client = await createClient();
  const properties = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from("properties_catalog").select("*")
      .order("last_seen_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (error) throw new Error("Property query failed");
    const page = z.array(propertySchema).parse(data);
    properties.push(...page);
    if (page.length < 500) return properties;
  }
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
