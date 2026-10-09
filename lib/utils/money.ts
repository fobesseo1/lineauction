export function parseWon(value: string | null | undefined): string | null {
  if (!value?.trim() || ["비공개", "-"].includes(value.trim())) return null;
  const cleaned = value.trim();
  if (!/^\d+$/.test(cleaned) && !/^\d{1,3}(,\d{3})+$/.test(cleaned))
    throw new Error("Invalid money value");
  return BigInt(cleaned.replaceAll(",", "")).toString();
}
export function formatWon(value: string | null) {
  return value === null
    ? "비공개 / 미제공"
    : `${BigInt(value).toLocaleString("ko-KR")}원`;
}
// Keep the exact won amount separately when rounding the readable label.
export function formatKoreanWon(value: string | null) {
  if (value === null) return "비공개 / 미제공";
  const raw = BigInt(value);
  const amount = raw < 0n ? -raw : raw;
  const sign = raw < 0n ? "-" : "";
  if (amount < 1_000_000n) {
    const man = amount / 10_000n, won = amount % 10_000n;
    return `${sign}${man ? `${man}만` : ""}${won || !man ? won.toLocaleString("ko-KR") : ""}원`;
  }
  const rounded = ((amount + 500_000n) / 1_000_000n) * 1_000_000n;
  const eok = rounded / 100_000_000n;
  const man = (rounded % 100_000_000n) / 10_000n;
  const parts = [
    eok ? `${eok.toLocaleString("ko-KR")}억` : "",
    man / 1000n ? `${man / 1000n}천` : "",
    (man % 1000n) / 100n ? `${(man % 1000n) / 100n}백` : "",
  ].filter(Boolean);
  return `${rounded !== amount ? "약 " : ""}${sign}${parts.join(" ")}${man ? "만원" : "원"}`;
}
export function appraisalRatio(bid: string | null, appraisal: string | null) {
  if (bid === null || appraisal === null || BigInt(appraisal) === 0n)
    return null;
  return `${Number((BigInt(bid) * 1000n) / BigInt(appraisal)) / 10}%`;
}
