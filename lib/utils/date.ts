/** Official Onbid dates are Korean local time, yyyyMMddHHmm[ss]. */
export function parseKoreanDate(
  value: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  if (!/^\d{12}(\d{2})?$/.test(value))
    throw new Error("Invalid Onbid date format");
  const y = Number(value.slice(0, 4)),
    m = Number(value.slice(4, 6)),
    d = Number(value.slice(6, 8));
  const h = Number(value.slice(8, 10)),
    min = Number(value.slice(10, 12)),
    sec = Number(value.slice(12, 14) || 0);
  const local = new Date(Date.UTC(y, m - 1, d, h, min, sec));
  if (
    local.getUTCFullYear() !== y ||
    local.getUTCMonth() !== m - 1 ||
    local.getUTCDate() !== d ||
    h > 23 ||
    min > 59 ||
    sec > 59
  )
    throw new Error("Invalid Onbid calendar date");
  return new Date(local.getTime() - 9 * 3600000).toISOString();
}
export function formatDate(value: string | null) {
  return value
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "미제공";
}
