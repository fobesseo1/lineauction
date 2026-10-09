import { describe, expect, it } from "vitest";
import { mapAddress, matchCoordinates } from "../lib/maps/address";
describe("building map addresses",()=>{
 it.each([
  ["경기도 안양시 만안구 안양동 873-221 비동 3층301호","경기도 안양시 만안구 안양동 873-221"],
  ["서울특별시 강남구 일원동 719 101동 501호","서울특별시 강남구 일원동 719"],
  ["경기도 성남시 분당구 불정로 6 그린팩토리","경기도 성남시 분당구 불정로 6"],
  ["경기도 용인시 처인구 이동읍 송전리 산 12-3","경기도 용인시 처인구 이동읍 송전리 산 12-3"],
 ])("normalizes %s",(input,output)=>expect(mapAddress(input)).toBe(output));
 it("accepts the matching parcel, rejects nearby and ambiguous results",()=>{
  const q="경기도 안양시 만안구 안양동 873-221";
  const a={roadAddress:"경기도 안양시 만안구 다른로 1",jibunAddress:q,x:"126.92",y:"37.39"};
  expect(matchCoordinates(q,[a])).toEqual({latitude:37.39,longitude:126.92});
  expect(matchCoordinates(q,[{...a,jibunAddress:q+"1"}])).toBeNull();
  expect(matchCoordinates(q,[a,{...a,x:"127.0"}])).toBeNull();
 });
});
