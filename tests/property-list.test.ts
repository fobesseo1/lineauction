import { beforeEach, expect, it, vi } from "vitest";
import { getDemoProperties } from "@/lib/demo/data";

const catalog = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/env/public", () => ({ getPublicEnv: () => ({ url: "https://example.supabase.co", anonKey: "test" }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ from: () => {
  let source: string | undefined;
  const query = {
    select: () => query,
    eq: (_: string, value: string) => { source = value; return query; },
    order: () => query,
    range: (start: number, end: number) => catalog.read(source, start, end),
  };
  return query;
} }) }));

beforeEach(() => { vi.resetModules(); catalog.read.mockReset(); });

it("returns every page in order and shares concurrent reads of the same public source", async () => {
  const fixture = getDemoProperties()[0];
  catalog.read.mockImplementation(async (source, start, end) => ({
    data: Array.from({ length: Math.min(end + 1, 2103) - start }, (_, index) => ({ ...fixture, source, source_property_id: String(start + index) })),
    count: 2103, error: null,
  }));
  const { listProperties } = await import("@/lib/repositories/property-repository");
  const [first, second] = await Promise.all([listProperties("court"), listProperties("court")]);
  expect(first).toHaveLength(2103);
  expect(second).toBe(first);
  expect(first[2102].source_property_id).toBe("2102");
  expect(catalog.read).toHaveBeenCalledTimes(3);
  await listProperties("court");
  expect(catalog.read).toHaveBeenCalledTimes(3);
  await listProperties("onbid");
  expect(catalog.read).toHaveBeenCalledTimes(6);
  expect(catalog.read).toHaveBeenCalledWith("onbid", 0, 999);
});

it("does not retain a failed public query in the cache", async () => {
  catalog.read.mockResolvedValueOnce({ data: null, count: null, error: { message: "temporary failure" } });
  catalog.read.mockResolvedValueOnce({ data: [], count: 0, error: null });
  const { listProperties } = await import("@/lib/repositories/property-repository");
  await expect(listProperties("court")).rejects.toThrow("Property query failed");
  await expect(listProperties("court")).resolves.toEqual([]);
  expect(catalog.read).toHaveBeenCalledTimes(2);
});
