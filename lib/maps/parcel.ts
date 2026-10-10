// Onbid listings often leave the address field at 동/읍 level while the title carries the full
// parcel ("경기도 화성시 남양읍 2075-18 제308호 오피스텔"). Return the first candidate cut at its
// parcel number so map lookups land on the lot rather than the town centre.
const PARCEL = /^(.+?(?:동|리|가|읍|면|로|길)\s+(?:산\s*)?\d+(?:-\d+)?)(?=\s|,|\(|$)/;

export function parcelAddress(...candidates: Array<string | null | undefined>) {
  for (const candidate of candidates) {
    const clean = candidate?.replace(/^소재지\s*[:：]\s*/, "").split(" / ")[0].trim().replace(/\s+/g, " ");
    const parcel = clean?.match(PARCEL)?.[1];
    if (parcel) return parcel;
  }
  return null;
}
