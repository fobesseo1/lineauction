import {inEnabledArea} from '../regions.mjs';
// Enabled regions (scripts/regions.json; 서울·경기·인천 today). inSeoulGyeonggi is the legacy name kept for callers.
export function inCapitalArea(item) {
  // Use each asset's address, not court jurisdiction (which can cross boundaries).
  const addresses = item.assets?.map(a => a.address?.trim()).filter(Boolean) ?? [];
  // Partial regions (전남광주: 광주 5개 구 only) also check the 시군구; old names (광주광역시) count.
  return addresses.length > 0 && addresses.every(a => inEnabledArea(a));
}

export const inSeoulGyeonggi = inCapitalArea;
