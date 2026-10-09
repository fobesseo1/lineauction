import { z } from "zod";
export const wonSchema = z
  .string()
  .regex(/^\d+$/)
  .refine((v) => BigInt(v) < 10n ** 30n);
export const propertyInputSchema = z.object({
  source: z.enum(["onbid", "court"]),
  source_property_id: z.string().min(1),
  auction_condition_id: z.string().min(1),
  notice_id: z.string().nullable(),
  title: z.string().min(1),
  property_type: z.string(),
  usage_type: z.string().nullable(),
  asset_type: z.string().nullable(),
  address: z.string().nullable(),
  sido: z.string().nullable(),
  sigungu: z.string().nullable(),
  dong: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  appraisal_price: wonSchema.nullable(),
  minimum_bid_price: wonSchema.nullable(),
  failed_bid_count: z.number().int().nonnegative().nullable(),
  auction_round: z.string().nullable(),
  auction_sequence: z.string().nullable(),
  bid_start_at: z.iso.datetime({ offset: true }).nullable(),
  bid_end_at: z.iso.datetime({ offset: true }).nullable(),
  status: z.string().nullable(),
  status_code: z.string().nullable(),
  disposal_method: z.string().nullable(),
  disposal_code: z.string().nullable(),
  bulk_bid: z.boolean().nullable(),
  land_area: z.number().nonnegative().nullable(),
  building_area: z.number().nonnegative().nullable(),
  exclusive_area: z.number().nonnegative().nullable(),
  pnu: z.string().nullable(),
  source_updated_at: z.iso.datetime({ offset: true }).nullable(),
});
export const propertySchema = propertyInputSchema.extend({
  id: z.uuid(),
  first_seen_at: z.string(),
  last_seen_at: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  lifecycle_state: z.enum(["observed", "needs-recheck", "needs-review", "closed"]).nullable().optional(),
  lifecycle_reason: z.string().nullable().optional(),
  lifecycle_checked_at: z.string().nullable().optional(),
  cover_image: z.string().nullable().optional(),
});
export type PropertyInput = z.infer<typeof propertyInputSchema>;
export type Property = z.infer<typeof propertySchema>;
export type CollectionResult = {
  created: number;
  updated: number;
  unchanged: number;
  stale: number;
  failed: number;
  pages: number;
  complete: boolean;
};
