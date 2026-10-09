import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import fixture from "./fixtures/onbid-list.json";
import { onbidItemSchema } from "@/lib/api/onbid/schemas";
import { mapOnbidItem } from "@/lib/api/onbid/mapper";
const db = new PGlite();
const input = mapOnbidItem(
  onbidItemSchema.parse(fixture.response.body.items.item[0]),
);
beforeAll(async () => {
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql as 'select null::uuid'; grant usage on schema public,auth to anon,authenticated,service_role;",
  );
  await db.exec(
    await readFile(
      "supabase/migrations/20261006120402_initial_schema.sql",
      "utf8",
    ),
  );
  await db.exec(await readFile("supabase/seed.sql", "utf8"));
}, 30000);
afterAll(async () => {
  await db.close();
});
const save = async (data: typeof input, time: string) =>
  (
    await db.query<{ outcome: string }>(
      "select public.upsert_auction_property($1::jsonb,$2::timestamptz) as outcome",
      [JSON.stringify(data), time],
    )
  ).rows[0].outcome;
describe("PostgreSQL persistence and access", () => {
  it("creates once, tracks only changes, rejects stale writes, preserves first_seen", async () => {
    expect(await save(input, "2026-10-06T01:00:00Z")).toBe("created");
    expect(await save(input, "2026-10-06T02:00:00Z")).toBe("unchanged");
    const changed = {
      ...input,
      minimum_bid_price: "350000000",
      failed_bid_count: 4,
    };
    expect(await save(changed, "2026-10-06T03:00:00Z")).toBe("updated");
    expect(await save(input, "2026-10-06T00:00:00Z")).toBe("stale");
    const rows = (
      await db.query<{ price: string; first_seen: string; count: number }>(
        "select minimum_bid_price::text price,first_seen_at::text first_seen,(select count(*)::int from public.property_price_history) count from public.properties",
      )
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe("350000000");
    expect(rows[0].count).toBe(2);
    expect(Date.parse(rows[0].first_seen)).toBe(
      Date.parse("2026-10-06T01:00:00Z"),
    );
    expect(
      await save(
        { ...changed, bid_end_at: "2026-10-08T08:00:00.000Z" },
        "2026-10-06T04:00:00Z",
      ),
    ).toBe("updated");
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from public.property_price_history",
        )
      ).rows[0].count,
    ).toBe(3);
  });
  it("keeps separate auction conditions and exact large money", async () => {
    expect(
      await save(
        {
          ...input,
          auction_condition_id: "999",
          minimum_bid_price: "9007199254740993",
        },
        "2026-10-06T05:00:00Z",
      ),
    ).toBe("created");
    const result = await db.query<{ minimum_bid_price: string }>(
      "select minimum_bid_price from public.properties_public where auction_condition_id='999'",
    );
    expect(result.rows[0].minimum_bid_price).toBe("9007199254740993");
  });
  it("allows public reads while blocking collector RPC and settings access", async () => {
    await db.exec("set role anon");
    try {
      expect(
        (await db.query("select * from public.properties_public")).rows.length,
      ).toBe(2);
      await expect(save(input, "2026-10-06T06:00:00Z")).rejects.toThrow(
        /permission denied/,
      );
      await expect(
        db.query("select * from public.app_settings"),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query("delete from public.properties")).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec("reset role");
    }
  });
});
