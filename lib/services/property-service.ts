import "server-only";
import type { AuctionSource } from "@/types/auction-source";
import type { CollectionResult, PropertyInput } from "@/types/property";
import { upsertProperty } from "@/lib/repositories/property-repository";
type SaveProperty = (
  input: PropertyInput,
  checkedAt: string,
) => Promise<"created" | "updated" | "unchanged" | "stale">;
export async function collectProperties(
  source: AuctionSource,
  options: { maxPages: number; intervalMs: number },
  save: SaveProperty = upsertProperty,
): Promise<CollectionResult> {
  const result: CollectionResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    stale: 0,
    failed: 0,
    pages: 0,
    complete: false,
  };
  for (let pageNo = 1; pageNo <= options.maxPages; pageNo++) {
    const checkedAt = new Date().toISOString();
    let page;
    try {
      page = await source.fetchActiveProperties(pageNo);
    } catch {
      result.failed++;
      break;
    }
    result.pages++;
    result.failed += page.rejected;
    for (const property of page.items) {
      try {
        result[await save(property, checkedAt)]++;
      } catch {
        result.failed++;
      }
    }
    if (pageNo * page.numOfRows >= page.totalCount) {
      result.complete = result.failed === 0;
      break;
    }
    if (pageNo < options.maxPages)
      await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
  }
  // Missing items are NOT closed: a failed, capped or changing listing is not evidence of closure.
  return result;
}
