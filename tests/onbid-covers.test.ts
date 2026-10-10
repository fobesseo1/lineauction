import { expect, it, vi } from "vitest";
import { getDemoProperties } from "@/lib/demo/data";
import { officialOnbidCover, attachOnbidCovers } from "@/lib/services/onbid-covers";

vi.mock("node:fs/promises", () => ({
  stat: async () => ({ mtimeMs: 1 }),
  readFile: async () => JSON.stringify({ saved: { cltrMngNo: "2024-0100-008372", pbctCdtnNo: "4685522", thnlImgUrlAdr: "https://www.onbid.co.kr/photo.jpg" } }),
}));

it("uses the saved official photo for its exact property and auction condition without changing court photos", async () => {
  const fixture = getDemoProperties()[0];
  const court = { ...fixture, source: "court" as const, cover_image: "/court.jpg" };
  const onbid = { ...fixture, source: "onbid" as const, source_property_id: "2024-0100-008372", auction_condition_id: "4685522", cover_image: null };
  const rows = await attachOnbidCovers([court, onbid, { ...onbid, auction_condition_id: "different" }]);
  expect(rows[0]).toBe(court);
  expect(rows[1].cover_image).toBe("https://www.onbid.co.kr/photo.jpg");
  expect(rows[2].cover_image).toBeNull();
  expect(onbid.cover_image).toBeNull();
});

it("rejects unofficial or unsafe image URLs", () => {
  for (const value of ["http://www.onbid.co.kr/photo.jpg", "https://www.onbid.co.kr.evil.test/image", "https://user:pass@www.onbid.co.kr/image", "javascript:alert(1)", null]) expect(officialOnbidCover(value)).toBeNull();
});
