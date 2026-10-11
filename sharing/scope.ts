// Match the collector's conservative address rule (수도권: Seoul, Gyeonggi, Incheon) for every asset in a bundle.
export function inPublicScope(address: string | null) {
  return !!address && address.split(" / ").every(part => /^(서울특별시|경기도|인천광역시)\s/.test(part.trim()));
}
