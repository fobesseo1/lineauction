export function inSeoulGyeonggi(item) {
  // Use each asset's address, not court jurisdiction (which can cross boundaries).
  const addresses = item.assets?.map(a => a.address?.trim()).filter(Boolean) ?? [];
  return addresses.length > 0 && addresses.every(a => /^(서울특별시|경기도)\s/.test(a));
}
