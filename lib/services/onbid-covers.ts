import "server-only";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { CardProperty } from "@/types/catalog";
import { officialOnbidCover } from "@/lib/onbid-cover";
export { officialOnbidCover } from "@/lib/onbid-cover";

let cached: { modified: number; covers: Map<string, string> } | undefined;
let pending: Promise<Map<string, string>> | undefined;
async function coverIndex() {
  if (pending) return pending;
  pending = (async () => {
    const file = path.join(process.cwd(), "data/onbid/targets.json");
    try {
      const modified = (await stat(file)).mtimeMs;
      if (cached?.modified === modified) return cached.covers;
      const targets = JSON.parse(await readFile(file, "utf8")) as Record<string, Record<string, unknown>>;
      const covers = new Map<string, string>();
      for (const row of Object.values(targets)) {
        const url = officialOnbidCover(row.thnlImgUrlAdr);
        if (url && row.cltrMngNo && row.pbctCdtnNo) covers.set(`${row.cltrMngNo}:${row.pbctCdtnNo}`, url);
      }
      cached = { modified, covers };
      return covers;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map<string, string>();
      throw error;
    }
  })();
  try { return await pending; } finally { pending = undefined; }
}

// Only the official cover URL leaves the server; raw cached API records stay private.
export async function attachOnbidCovers<T extends CardProperty>(properties: T[]):Promise<T[]> {
  if (!properties.some(p => p.source === "onbid")) return properties;
  const covers = await coverIndex();
  return properties.map(p => p.source === "onbid" ? {
    ...p, cover_image: officialOnbidCover(p.cover_image) ?? covers.get(`${p.source_property_id}:${p.auction_condition_id}`) ?? null,
  } : p);
}
