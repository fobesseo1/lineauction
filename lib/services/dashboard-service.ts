import "server-only";
import { hasSupabaseConfig } from "@/lib/env/public";
import {
  listProperties,
  findProperty,
  listPriceHistory,
} from "@/lib/repositories/property-repository";
import { getDemoProperties, getDemoHistory } from "@/lib/demo/data";
import type {
  PropertyListing,
  ListingState,
  PriceHistoryEntry,
} from "@/types/listing";
export function getRenderTimestamp() {
  return Date.now();
}
export function isDemoMode(mode?: string) {
  if (mode === "1") return true;
  if (mode === "0") return false;
  if (process.env.DEMO_MODE === "true") return true;
  if (process.env.DEMO_MODE === "false") return false;
  return !hasSupabaseConfig();
}
export async function loadPropertyList(mode?: string): Promise<{
  properties: PropertyListing[];
  state: ListingState;
}> {
  if (isDemoMode(mode))
    return { properties: getDemoProperties(), state: "demo" };
  if (!hasSupabaseConfig()) return { properties: [], state: "unconfigured" };
  try {
    return { properties: await listProperties(), state: "ready" };
  } catch {
    return { properties: [], state: "error" };
  }
}
export async function loadPropertyDetail(
  id: string,
  mode?: string,
): Promise<{ property: PropertyListing; history: PriceHistoryEntry[] } | null> {
  if (isDemoMode(mode)) {
    const property = getDemoProperties().find((p) => p.id === id);
    return property ? { property, history: getDemoHistory(property) } : null;
  }
  if (!hasSupabaseConfig()) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const [property, history] = await Promise.all([findProperty(id), listPriceHistory(id)]);
  return property ? { property, history } : null;
}
