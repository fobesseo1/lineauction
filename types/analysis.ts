import { z } from "zod";
import { wonSchema } from "./property";

export const scoringConfigSchema = z.object({
  version: z.number().int().positive(),
  weights: z.object({
    price_attractiveness: z.number().nonnegative(),
    failed_bids: z.number().nonnegative(),
    transaction_activity: z.number().nonnegative(),
    competition: z.number().nonnegative(),
    profitability: z.number().nonnegative(),
  }).refine((weights) => Object.values(weights).reduce((sum, value) => sum + value, 0) === 100, "Weights must total 100"),
});
export type ScoringConfig = z.infer<typeof scoringConfigSchema>;
export type DealGrade = "S" | "A" | "B" | "C" | "D";
export interface PropertyAnalysis {
  property_id: string;
  market_price: z.infer<typeof wonSchema> | null;
  market_price_method: string | null;
  appraisal_ratio: number | null;
  market_ratio: number | null;
  discount_rate: number | null;
  estimated_price_gap: string | null;
  transaction_count_3m: number;
  transaction_count_6m: number;
  transaction_count_12m: number;
  deal_score: number | null;
  deal_grade: DealGrade | null;
  score_breakdown: Record<string, number> | null;
  calculated_at: string;
}
export interface Transaction {
  source: string;
  source_transaction_id: string;
  property_id: string | null;
  property_type: "apartment" | "officetel" | "commercial" | "land";
  complex_name: string | null;
  transaction_date: string;
  price: string;
  area: number;
  floor: number | null;
  address: string | null;
  sido: string | null;
  sigungu: string | null;
  dong: string | null;
  region_code: string;
  cancelled_at: string | null;
}
// Reserved domain models; data collection/analysis is implemented in later phases.
