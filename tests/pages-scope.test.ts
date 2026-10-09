import { describe, it, expect } from "vitest";
import { inPublicScope } from "../sharing/scope";
describe("public sharing scope", () => {
  it("keeps Seoul and Gyeonggi bundles within the collector's approved scope", () => {
    expect(inPublicScope("서울특별시 강남구 역삼동 1 / 경기도 성남시 분당구 정자동 2")).toBe(true);
    expect(inPublicScope("경기도 용인시 기흥구 청덕동 556 / 인천광역시 남동구 구월동 1")).toBe(false);
    expect(inPublicScope("경기도 용인시 기흥구 청덕동 556 / 소재지 : 경기도 용인시 기흥구 청덕동 556")).toBe(false);
    expect(inPublicScope(null)).toBe(false);
  });
});
