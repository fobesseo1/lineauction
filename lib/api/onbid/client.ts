import "server-only";
import type { AuctionSource, AuctionPage } from "@/types/auction-source";
import { getCollectorEnv } from "@/lib/env/server";
import { onbidItemSchema } from "./schemas";
import { parseOnbidResponse } from "./parser";
import { mapOnbidItem } from "./mapper";

export const ONBID_ENDPOINT =
  "https://apis.data.go.kr/B010003/OnbidRlstListSrvc2/getRlstCltrList2";
export class OnbidError extends Error {
  constructor(public readonly code: string) {
    super(`Onbid request failed (${code})`);
  }
}
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Config = ReturnType<typeof getCollectorEnv>;
export class OnbidSource implements AuctionSource {
  constructor(
    private readonly config: Config = getCollectorEnv(),
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async fetchActiveProperties(pageNo: number): Promise<AuctionPage> {
    if (!Number.isSafeInteger(pageNo) || pageNo < 1)
      throw new OnbidError("INVALID_PAGE");
    const url = new URL(ONBID_ENDPOINT);
    const params = {
      serviceKey: this.config.key,
      pageNo: String(pageNo),
      numOfRows: String(this.config.pageSize),
      resultType: "json",
      prptDivCd: this.config.propertyCodes,
      dspsMthodCd: this.config.disposalCode,
      bidDivCd: this.config.bidDivisionCode,
      pvctTrgtYn: this.config.privateContract,
    };
    Object.entries(params).forEach(([key, value]) =>
      url.searchParams.set(key, value),
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.fetcher(url, {
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
          redirect: "error",
        });
        if (!response.ok) throw new OnbidError(`HTTP_${response.status}`);
        const envelope = parseOnbidResponse(await response.text());
        if (!["00", "0", "0000"].includes(envelope.header.resultCode))
          throw new OnbidError(envelope.header.resultCode);
        const body = envelope.body;
        if (!body || body.pageNo !== pageNo || body.numOfRows < 1)
          throw new OnbidError("INVALID_PAGE_RESPONSE");
        const value =
          body.items && typeof body.items === "object" ? body.items.item : [];
        const rows = Array.isArray(value) ? value : value ? [value] : [];
        if (!rows.length && (pageNo - 1) * body.numOfRows < body.totalCount)
          throw new OnbidError("INCOMPLETE_PAGE");
        const items: AuctionPage["items"] = [];
        let rejected = 0;
        for (const row of rows) {
          try {
            items.push(mapOnbidItem(onbidItemSchema.parse(row)));
          } catch {
            rejected++;
          }
        }
        return {
          items,
          totalCount: body.totalCount,
          pageNo,
          numOfRows: body.numOfRows,
          rejected,
        };
      } catch (error) {
        const code =
          error instanceof OnbidError
            ? error.code
            : error instanceof TypeError ||
                (error instanceof Error &&
                  ["TimeoutError", "AbortError"].includes(error.name))
              ? "NETWORK"
              : "INVALID_RESPONSE";
        const retry = [
          "NETWORK",
          "HTTP_500",
          "HTTP_502",
          "HTTP_503",
          "HTTP_504",
          "01",
          "04",
          "05",
          "23",
        ].includes(code);
        if (!retry || attempt === 2) throw new OnbidError(code);
        await sleep(Math.max(this.config.intervalMs, 1000 * 2 ** attempt));
      }
    }
    throw new OnbidError("RETRIES_EXHAUSTED");
  }
  async fetchPropertyDetail(): Promise<never> {
    // TODO: verify separate detail endpoint and response before implementing.
    throw new OnbidError("DETAIL_NOT_IMPLEMENTED");
  }
}
