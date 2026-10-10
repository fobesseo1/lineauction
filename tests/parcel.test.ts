import { describe, it, expect } from "vitest";
import { parcelAddress } from "../lib/maps/parcel";

describe("parcelAddress", () => {
  it("cuts Onbid titles at the parcel number, including 읍/면 parcels", () => {
    expect(parcelAddress(null, "경기도 화성시 남양읍 2075-18   제706호 오피스텔")).toBe("경기도 화성시 남양읍 2075-18");
    expect(parcelAddress(null, "서울특별시 강서구 화곡동 370-4 외 2필지 소노빌리지 제101동 제6층 제601호")).toBe("서울특별시 강서구 화곡동 370-4");
    expect(parcelAddress("경기도 양평군 양서면 산 12-3 임야")).toBe("경기도 양평군 양서면 산 12-3");
  });
  it("prefers the first candidate that has a parcel and skips town-level addresses", () => {
    expect(parcelAddress("경기도 화성시 만세구 남양읍", "경기도 화성시 남양읍 2075-18 제308호")).toBe("경기도 화성시 남양읍 2075-18");
    expect(parcelAddress("경기도 부천시 원미구 상동 397 반달마을 1817동 / 경기도 부천시 원미구 상동 398")).toBe("경기도 부천시 원미구 상동 397");
    expect(parcelAddress(null, undefined, "주소 미상")).toBeNull();
  });
});
