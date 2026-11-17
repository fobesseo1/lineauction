import {sidoPrefixPattern} from '../regions.mjs';
// Enabled regions (scripts/regions.json; 서울·경기·인천 today). inSeoulGyeonggi is the legacy name kept for callers.
const SIDO_PREFIX = sidoPrefixPattern();
export function inCapitalArea(item) {
  // Use each asset's address, not court jurisdiction (which can cross boundaries).
  const addresses = item.assets?.map(a => a.address?.trim()).filter(Boolean) ?? [];
  return addresses.length > 0 && addresses.every(a => SIDO_PREFIX.test(a));
}

export const inSeoulGyeonggi = inCapitalArea;
