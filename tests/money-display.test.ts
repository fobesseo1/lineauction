import { describe, expect, it } from "vitest";
import { formatKoreanWon, formatWon } from "../lib/utils/money";

describe("readable Korean prices", () => {
  it.each([
    ["918000000", "9억 1천 8백만원"],
    ["770000000", "7억 7천만원"],
    ["795000000", "7억 9천 5백만원"],
    ["918490000", "약 9억 1천 8백만원"],
    ["918500000", "약 9억 1천 9백만원"],
    ["99950000", "약 1억원"],
    ["100000000", "1억원"],
    ["1000000", "1백만원"],
    ["0", "0원"],
    ["163840000", "약 1억 6천 4백만원"],
    ["-163840000", "약 -1억 6천 4백만원"],
    ["450000", "45만원"],
    [null, "비공개 / 미제공"],
  ])("formats %s without losing rounding information", (value, expected) => {
    expect(formatKoreanWon(value)).toBe(expected);
  });
  it("preserves the exact won value alongside the rounded label", () => {
    expect(formatWon("918500000")).toBe("918,500,000원");
  });
});
