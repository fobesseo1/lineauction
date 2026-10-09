import type { PropertyListing, PriceHistoryEntry } from "@/types/listing";
import { propertySchema } from "@/types/property";

// Fictional presentation data only. Never written to Supabase or used by collection jobs.
const samples = [
  {
    title: "마포 리버뷰 아파트",
    complex: "리버뷰 파크",
    region: ["서울특별시", "마포구", "합정동"],
    usage: "아파트",
    area: 84.9,
    appraisal: "920000000",
    bid: "585000000",
    market: "870000000",
    score: 94,
    fails: 4,
    days: 3,
    image: "apartment",
    position: "center",
  },
  {
    title: "분당 센트럴 오피스텔",
    complex: "센트럴 스튜디오",
    region: ["경기도", "성남시 분당구", "정자동"],
    usage: "오피스텔",
    area: 42.6,
    appraisal: "360000000",
    bid: "234000000",
    market: "340000000",
    score: 88,
    fails: 3,
    days: 0,
    image: "officetel",
    position: "center",
  },
  {
    title: "성수 코너 상가",
    complex: "성수 코너스퀘어",
    region: ["서울특별시", "성동구", "성수동"],
    usage: "상가",
    area: 126.4,
    appraisal: "1180000000",
    bid: "790000000",
    market: "1090000000",
    score: 85,
    fails: 2,
    days: 5,
    image: "commercial",
    position: "left",
  },
  {
    title: "광교 레이크 아파트",
    complex: "레이크 가든",
    region: ["경기도", "수원시 영통구", "하동"],
    usage: "아파트",
    area: 74.8,
    appraisal: "730000000",
    bid: "438000000",
    market: "690000000",
    score: 92,
    fails: 5,
    days: 7,
    image: "apartment",
    position: "right",
  },
  {
    title: "송도 테라스 오피스텔",
    complex: "테라스 레지던스",
    region: ["인천광역시", "연수구", "송도동"],
    usage: "오피스텔",
    area: 36.2,
    appraisal: "285000000",
    bid: "205200000",
    market: "270000000",
    score: 78,
    fails: 2,
    days: 2,
    image: "officetel",
    position: "right",
  },
  {
    title: "판교 가든 오피스",
    complex: "가든 비즈센터",
    region: ["경기도", "성남시 분당구", "삼평동"],
    usage: "업무시설",
    area: 165.3,
    appraisal: "980000000",
    bid: "686000000",
    market: "930000000",
    score: 81,
    fails: 3,
    days: 10,
    image: "commercial",
    position: "center",
  },
  {
    title: "해운대 오션 아파트",
    complex: "오션 포레",
    region: ["부산광역시", "해운대구", "우동"],
    usage: "아파트",
    area: 59.8,
    appraisal: "620000000",
    bid: "434000000",
    market: "580000000",
    score: 76,
    fails: 2,
    days: 1,
    image: "apartment",
    position: "left",
  },
  {
    title: "대전 시티 오피스텔",
    complex: "시티 아틀리에",
    region: ["대전광역시", "서구", "둔산동"],
    usage: "오피스텔",
    area: 28.4,
    appraisal: "195000000",
    bid: "148200000",
    market: "183000000",
    score: 68,
    fails: 1,
    days: 4,
    image: "officetel",
    position: "left",
  },
];
export function getDemoProperties(now = new Date()): PropertyListing[] {
  const localDay = new Date(now.getTime() + 9 * 3600000)
    .toISOString()
    .slice(0, 10);
  const anchor = Date.parse(`${localDay}T00:00:00+09:00`);
  const timestamp = (days: number, hour = 10) =>
    new Date(anchor + days * 86400000 + hour * 3600000).toISOString();
  return samples.map((s, index) => {
    const id = `de000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    const discountRate = Number((1 - Number(s.bid) / Number(s.market)) * 100);
    const grade =
      s.score >= 90 ? "S" : s.score >= 80 ? "A" : s.score >= 70 ? "B" : "C";
    const base = propertySchema.parse({
      id,
      source: "onbid",
      source_property_id: `DEMO-${String(index + 1).padStart(4, "0")}`,
      auction_condition_id: `DEMO-CONDITION-${index + 1}`,
      notice_id: null,
      title: s.title,
      property_type: "real_estate",
      usage_type: s.usage,
      asset_type: "샘플 재산",
      address: `${s.region.join(" ")} · 가상 주소`,
      sido: s.region[0],
      sigungu: s.region[1],
      dong: s.region[2],
      latitude: null,
      longitude: null,
      appraisal_price: s.appraisal,
      minimum_bid_price: s.bid,
      failed_bid_count: s.fails,
      auction_round: null,
      auction_sequence: String(s.fails + 1),
      bid_start_at: timestamp(-2),
      bid_end_at: timestamp(s.days, 23),
      status: "입찰진행중",
      status_code: "0002",
      disposal_method: "매각",
      disposal_code: "0001",
      bulk_bid: false,
      land_area: null,
      building_area: s.area,
      exclusive_area:
        s.usage === "아파트" || s.usage === "오피스텔" ? s.area : null,
      pnu: null,
      source_updated_at: timestamp(0, 0),
      first_seen_at: timestamp(index < 3 ? 0 : -index, 0),
      last_seen_at: timestamp(0, 0),
      created_at: timestamp(-index, 0),
      updated_at: timestamp(0, 0),
    });
    const activity = 15,
      competition = 9,
      profitability = 20;
    const failedBids = Math.min(s.fails * 3, 15);
    const price = s.score - activity - competition - profitability - failedBids;
    return {
      ...base,
      demo: {
        image: `/demo/${s.image}.png`,
        imagePosition: s.position,
        complexName: s.complex,
        analysis: {
          marketPrice: s.market,
          discountRate,
          priceGap: (BigInt(s.market) - BigInt(s.bid)).toString(),
          dealScore: s.score,
          dealGrade: grade,
          transactionCount: 8 + index * 3,
          marketPriceMethod: "동일 단지 · 면적 ±5% · 최근 6개월 중앙값 (샘플)",
          scoreBreakdown: [
            {
              label: "가격매력도",
              score: price,
              maximum: 40,
              reason: `시장가 대비 ${discountRate.toFixed(1)}% 할인 · 예시 점수`,
            },
            {
              label: "유찰횟수",
              score: failedBids,
              maximum: 15,
              reason: `누적 ${s.fails}회 유찰 · 예시 점수`,
            },
            {
              label: "거래활성도",
              score: activity,
              maximum: 15,
              reason: `비교 거래 ${8 + index * 3}건 · 예시 점수`,
            },
            {
              label: "경쟁도",
              score: competition,
              maximum: 10,
              reason: "가상의 경쟁도 지표 · 예시 점수",
            },
            {
              label: "예상수익성",
              score: profitability,
              maximum: 20,
              reason: "단순 가격차 기준 · 예시 점수",
            },
          ],
        },
        transactions: [-90, -60, -35, -15].map((days, i) => ({
          date: timestamp(days).slice(0, 10),
          price: (
            BigInt(s.market) +
            BigInt(i < 2 ? i - 2 : i - 1) * 5000000n
          ).toString(),
          area: s.area + (i % 2 === 0 ? 0 : 0.2),
          floor: 6 + i * 3,
        })),
      },
    };
  });
}
export function getDemoHistory(property: PropertyListing): PriceHistoryEntry[] {
  return [0, 1, 2].map((i) => ({
    id: `${property.id}-history-${i}`,
    minimum_bid_price: (
      BigInt(property.minimum_bid_price || "0") +
      BigInt(i) * 30000000n
    ).toString(),
    appraisal_price: property.appraisal_price,
    failed_bid_count: Math.max(0, (property.failed_bid_count || 0) - i),
    status: i === 0 ? "입찰진행중" : "유찰",
    bid_start_at: property.bid_start_at,
    bid_end_at: property.bid_end_at,
    checked_at: new Date(
      Date.parse(property.last_seen_at) - i * 30 * 86400000,
    ).toISOString(),
  }));
}
