import "server-only";
import { timingSafeEqual } from "node:crypto";
export function isCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`),
    supplied = Buffer.from(request.headers.get("authorization") || "");
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
}
