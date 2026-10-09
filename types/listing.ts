import type { Property } from "./property";
import type { DealGrade } from "./analysis";
export interface DemoAnalysis {
  marketPrice: string;
  discountRate: number;
  priceGap: string;
  dealScore: number;
  dealGrade: DealGrade;
  transactionCount: number;
  marketPriceMethod: string;
  scoreBreakdown: {
    label: string;
    score: number;
    maximum: number;
    reason: string;
  }[];
}
export interface PropertyListing extends Property {
  demo?: {
    image: string;
    imagePosition: string;
    complexName: string;
    analysis: DemoAnalysis;
    transactions: {
      date: string;
      price: string;
      area: number;
      floor: number;
    }[];
  };
}
export interface PriceHistoryEntry {
  id: string;
  minimum_bid_price: string | null;
  appraisal_price: string | null;
  failed_bid_count: number | null;
  status: string | null;
  bid_start_at: string | null;
  bid_end_at: string | null;
  checked_at: string;
}
export type ListingState = "ready" | "demo" | "unconfigured" | "error";
