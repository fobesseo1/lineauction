// Capital area (수도권): Seoul, Gyeonggi and Incheon. inSeoulGyeonggi is the legacy name kept for callers.
export function inCapitalArea(item) {
  // Use each asset's address, not court jurisdiction (which can cross boundaries).
  const addresses = item.assets?.map(a => a.address?.trim()).filter(Boolean) ?? [];
  return addresses.length > 0 && addresses.every(a => /^(서울특별시|경기도|인천광역시)\s/.test(a));
}

export const inSeoulGyeonggi = inCapitalArea;
