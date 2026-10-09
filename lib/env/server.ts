import "server-only";
import { z } from "zod";
export function getCollectorEnv() {
  return z
    .object({
      key: z.string().min(1),
      propertyCodes: z.string().regex(/^\d{4}(,\d{4})*$/),
      disposalCode: z.enum(["0001", "0002"]),
      bidDivisionCode: z.enum(["0001", "0002"]),
      privateContract: z.enum(["Y", "N"]),
      pageSize: z.coerce.number().int().min(1).max(100),
      maxPages: z.coerce.number().int().min(1).max(100),
      intervalMs: z.coerce.number().int().min(1000),
    })
    .parse({
      key: process.env.ONBID_API_KEY,
      propertyCodes: process.env.ONBID_PROPERTY_CODES || "0007",
      disposalCode: process.env.ONBID_DISPOSAL_CODE || "0001",
      bidDivisionCode: process.env.ONBID_BID_DIVISION_CODE || "0001",
      privateContract: process.env.ONBID_PRIVATE_CONTRACT || "N",
      pageSize: process.env.ONBID_PAGE_SIZE || 100,
      maxPages: process.env.ONBID_MAX_PAGES || 10,
      intervalMs: process.env.ONBID_REQUEST_INTERVAL_MS || 1000,
    });
}
