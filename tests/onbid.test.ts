import { describe, it, expect, vi, afterEach } from "vitest";
import fixture from "./fixtures/onbid-list.json";
import { OnbidSource, ONBID_ENDPOINT } from "@/lib/api/onbid/client";
import { parseOnbidResponse } from "@/lib/api/onbid/parser";
import { onbidItemSchema } from "@/lib/api/onbid/schemas";
import { mapOnbidItem } from "@/lib/api/onbid/mapper";
import { parseKoreanDate } from "@/lib/utils/date";
import { parseWon, appraisalRatio } from "@/lib/utils/money";
import { isCronAuthorized } from "@/lib/cron/auth";
import { collectProperties } from "@/lib/services/property-service";
import { propertyInputSchema } from "@/types/property";
const config = {
  key: "TEST_KEY+abc/==",
  propertyCodes: "0007",
  disposalCode: "0001" as const,
  bidDivisionCode: "0001" as const,
  privateContract: "N" as const,
  pageSize: 100,
  maxPages: 2,
  intervalMs: 1000,
};
const response = () => new Response(JSON.stringify(fixture));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
describe("official-contract adapter", () => {
  it("uses verified gateway endpoint and encodes the decoded key once", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    const page = await new OnbidSource(config, fetcher).fetchActiveProperties(
      1,
    );
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin + url.pathname).toBe(ONBID_ENDPOINT);
    expect(url.searchParams.get("serviceKey")).toBe(config.key);
    expect(url.searchParams.get("resultType")).toBe("json");
    expect(url.searchParams.get("pvctTrgtYn")).toBe("N");
    expect(page.items[0].minimum_bid_price).toBe("400000000");
    expect(page.items[0].address).toBeNull();
    expect(page.items[0].exclusive_area).toBeNull();
  });
  it("preserves integers larger than Number.MAX_SAFE_INTEGER", () => {
    const raw = JSON.stringify(fixture).replace(
      '"620000000"',
      "9007199254740993",
    );
    const body = parseOnbidResponse(raw).body!;
    const item =
      body.items && typeof body.items === "object"
        ? body.items.item
        : undefined;
    expect(
      mapOnbidItem(onbidItemSchema.parse((item as unknown[])[0]))
        .appraisal_price,
    ).toBe("9007199254740993");
  });
  it("handles XML and single-item envelopes", () => {
    const raw =
      "<response><header><resultCode>00</resultCode><resultMsg>OK</resultMsg></header><body><totalCount>1</totalCount><pageNo>1</pageNo><numOfRows>10</numOfRows><items><item><cltrMngNo>TEST</cltrMngNo><pbctCdtnNo>1</pbctCdtnNo></item></items></body></response>";
    expect(parseOnbidResponse(raw).body?.totalCount).toBe(1);
  });
  it("isolates invalid rows and hidden prices", async () => {
    const data = structuredClone(fixture);
    data.response.body.items.item[0].lowstBidPrcIndctCont = "비공개";
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(data)));
    expect(
      (await new OnbidSource(config, fetcher).fetchActiveProperties(1)).items[0]
        .minimum_bid_price,
    ).toBeNull();
    data.response.body.items.item[0].cltrBidEndDt = "202602301700";
    fetcher.mockResolvedValue(new Response(JSON.stringify(data)));
    expect(
      (await new OnbidSource(config, fetcher).fetchActiveProperties(1))
        .rejected,
    ).toBe(1);
  });
  it("retries transient errors but not invalid credentials, without leaking secrets", async () => {
    vi.useFakeTimers();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(response());
    const promise = new OnbidSource(config, fetcher).fetchActiveProperties(1);
    await vi.runAllTimersAsync();
    expect((await promise).items).toHaveLength(1);
    const denied = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            header: { resultCode: "30", resultMsg: config.key },
          }),
        ),
      );
    await expect(
      new OnbidSource(config, denied).fetchActiveProperties(1),
    ).rejects.toThrow("(30)");
    expect(denied).toHaveBeenCalledTimes(1);
  });
});
describe("collection and boundaries", () => {
  it("accepts timestamptz offsets returned by Supabase", () => {
    const property = mapOnbidItem(onbidItemSchema.parse(fixture.response.body.items.item[0]));
    expect(propertyInputSchema.parse({ ...property, bid_start_at: "2026-10-05T01:00:00+00:00" }).bid_start_at).toBe("2026-10-05T01:00:00+00:00");
  });
  it("reports partial persistence failure", async () => {
    const source = new OnbidSource(
      config,
      vi.fn<typeof fetch>().mockResolvedValue(response()),
    );
    const result = await collectProperties(source, config, async () => {
      throw new Error("DB unavailable");
    });
    expect(result.failed).toBe(1);
    expect(result.complete).toBe(false);
  });
  it("stops at configured page budget without claiming completion", async () => {
    const data = structuredClone(fixture);
    data.response.body.totalCount = "300";
    const source = new OnbidSource(
      config,
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(JSON.stringify(data))),
    );
    const result = await collectProperties(
      source,
      { ...config, maxPages: 1 },
      async () => "created",
    );
    expect(result.created).toBe(1);
    expect(result.complete).toBe(false);
  });
  it("rejects missing or incorrect cron secrets", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isCronAuthorized(new Request("http://localhost"))).toBe(false);
    vi.stubEnv("CRON_SECRET", "TEST");
    expect(
      isCronAuthorized(
        new Request("http://localhost", {
          headers: { authorization: "Bearer OTHER" },
        }),
      ),
    ).toBe(false);
    expect(
      isCronAuthorized(
        new Request("http://localhost", {
          headers: { authorization: "Bearer TEST" },
        }),
      ),
    ).toBe(true);
  });
  it("converts Korean dates and guards invalid calendar/money values", () => {
    expect(parseKoreanDate("202610071700")).toBe("2026-10-07T08:00:00.000Z");
    expect(() => parseKoreanDate("202602301700")).toThrow();
    expect(parseWon("1,234,567")).toBe("1234567");
    expect(parseWon("비공개")).toBeNull();
    expect(() => parseWon("1,23")).toThrow();
    expect(appraisalRatio("400000000", "620000000")).toBe("64.5%");
  });
});
