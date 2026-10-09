import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { getDemoProperties, getDemoHistory } from "@/lib/demo/data";
import { propertySchema } from "@/types/property";
vi.mock("@/lib/repositories/property-repository", () => ({
  listProperties: vi.fn(),
  findProperty: vi.fn(),
  listPriceHistory: vi.fn(),
}));
import { listProperties } from "@/lib/repositories/property-repository";
import {
  loadPropertyList,
  loadPropertyDetail,
} from "@/lib/services/dashboard-service";
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ""));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe("fictional presentation data", () => {
  it("keeps money, score totals, identifiers and sample median consistent", () => {
    const rows = getDemoProperties(new Date("2026-10-06T02:00:00Z"));
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((p) => p.id)).size).toBe(8);
    for (const p of rows) {
      expect(propertySchema.safeParse(p).success).toBe(true);
      expect(p.source_property_id).toMatch(/^DEMO-/);
      const demo = p.demo!;
      expect(BigInt(demo.analysis.priceGap)).toBe(
        BigInt(demo.analysis.marketPrice) - BigInt(p.minimum_bid_price!),
      );
      expect(
        demo.analysis.scoreBreakdown.reduce((sum, s) => sum + s.score, 0),
      ).toBe(demo.analysis.dealScore);
      for (const s of demo.analysis.scoreBreakdown) {
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(s.maximum);
      }
      const prices = demo.transactions
        .map((t) => BigInt(t.price))
        .sort((a, b) => (a < b ? -1 : 1));
      expect((prices[1] + prices[2]) / 2n).toBe(
        BigInt(demo.analysis.marketPrice),
      );
      expect(getDemoHistory(p)[0].minimum_bid_price).toBe(p.minimum_bid_price);
    }
  });
  it("serves demo without touching the repository and allows explicit real mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    vi.stubEnv("DEMO_MODE", "");
    const result = await loadPropertyList();
    expect(result.state).toBe("demo");
    expect(
      (await loadPropertyDetail(result.properties[0].id))?.property.demo,
    ).toBeDefined();
    expect(await loadPropertyDetail("missing", "1")).toBeNull();
    expect(await loadPropertyList("0")).toEqual({
      properties: [],
      state: "unconfigured",
    });
    expect(listProperties).not.toHaveBeenCalled();
  });
  it("does not disguise a live database failure as fictional listings", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-key");
    vi.stubEnv("DEMO_MODE", "");
    vi.mocked(listProperties).mockRejectedValueOnce(
      new Error("connection failed"),
    );
    expect(await loadPropertyList()).toEqual({
      properties: [],
      state: "error",
    });
  });
});
