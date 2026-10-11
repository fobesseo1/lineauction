import { DashboardSearch } from "@/components/property/dashboard-search";
import { PagedCatalog } from "@/components/property/paged-catalog";
import { loadCatalogPage } from "@/lib/services/catalog-service";
import { parseCatalogFilters } from "@/types/catalog";
import { isDemoMode } from "@/lib/services/dashboard-service";
import Link from "next/link";
import { ArrowRight, Search, Circle } from "lucide-react";
import {
  loadPropertyList,
  getRenderTimestamp,
} from "@/lib/services/dashboard-service";
import { PropertyCard } from "@/components/property/property-card";
import { CollectionState } from "@/components/collection-state";
import { DemoNotice } from "@/components/demo-notice";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const day = (date: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date(date),
  );
export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string; source?: string }>;
}) {
  const params = await searchParams;
  if(!isDemoMode(params.demo)) {
    const filters=parseCatalogFilters(new URLSearchParams({source:params.source??'court'}));
    const page=await loadCatalogPage(filters).catch(()=>null);
    return page?<PagedCatalog initialFilters={filters} initialPage={page}/>:<CollectionState state="error"/>;
  }
  const { properties, state } = await loadPropertyList(
    params.demo,
    params.source==='onbid'?'onbid':params.source==='all'?undefined:'court',
  );
  const demo = state === "demo",
    available = demo || state === "ready";
  if(!demo&&available)return <DashboardSearch key={params.source??'court'} initialSource={params.source} properties={properties.filter(p=>["서울특별시","경기도","인천광역시"].includes(p.sido??"")&&(p.source==="onbid"||(!!p.address&&p.address.split(" / ").every(a=>/^(서울특별시|경기도|인천광역시)\s/.test(a.trim())))))}/>;
  const today = day(new Date().toISOString()),
    now = getRenderTimestamp();
  const active = properties.filter(
    (p) =>
      ["0001", "0002"].includes(p.status_code || "") &&
      (!p.bid_end_at || Date.parse(p.bid_end_at) >= now),
  );
  const discountRates = properties.flatMap((p) =>
    p.demo ? [p.demo.analysis.discountRate] : [],
  );
  const suffix = demo ? "?demo=1" : "?demo=0";
  const stats = [
    {
      label: demo ? "활성 샘플 물건" : "수집된 부동산",
      value: available ? String(demo ? active.length : properties.length) : "—",
      note: demo ? "전국 5개 지역" : "수집 범위 기준 · 진행 여부는 원문 확인",
    },
    {
      label: "오늘 신규물건",
      value: available
        ? String(
            properties.filter((p) => day(p.first_seen_at) === today).length,
          )
        : "—",
      note: demo ? "신규 샘플 후보" : "최초 수집일 기준",
    },
    {
      label: demo ? "S등급 후보" : "법원경매 물건",
      value: demo
        ? String(
            properties.filter((p) => p.demo?.analysis.dealGrade === "S").length,
          )
        : available ? String(properties.filter(p=>p.source==="court").length) : "—",
      note: demo ? "90점 이상" : "대한민국 법원경매정보",
    },
    {
      label: demo ? "A등급 후보" : "온비드 공매물건",
      value: demo
        ? String(
            properties.filter((p) => p.demo?.analysis.dealGrade === "A").length,
          )
        : available ? String(properties.filter(p=>p.source==="onbid").length) : "—",
      note: demo ? "80점 이상" : "온비드 API 수집 범위",
    },
    {
      label: "오늘 입찰마감",
      value: available
        ? String(
            properties.filter(
              (p) => p.bid_end_at && day(p.bid_end_at) === today,
            ).length,
          )
        : "—",
      note: "입찰 마감시각이 제공된 물건 기준",
    },
    {
      label: demo ? "평균 할인율" : "실거래 비교",
      value: discountRates.length
        ? `${(discountRates.reduce((a, b) => a + b, 0) / discountRates.length).toFixed(1)}%`
        : "—",
      note: demo ? "가상 시장가 대비" : "물건 상세에서 채택 거래·차이 확인",
    },
  ];
  const featured = demo
    ? [...properties]
        .sort(
          (a, b) =>
            (b.demo?.analysis.dealScore || 0) -
            (a.demo?.analysis.dealScore || 0),
        )
        .slice(0, 4)
    : properties.slice(0, 8);
  const ending = demo
    ? [...properties]
        .sort(
          (a, b) =>
            Date.parse(a.bid_end_at || "") - Date.parse(b.bid_end_at || ""),
        )
        .slice(0, 4)
    : [];
  return (
    <div className="space-y-10">
      <DemoNotice active={demo} />
      <section>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="mb-2 text-xs text-muted-foreground">
              AUCTION DEAL FINDER
            </p>
            <h1>가격 너머의 기회를 살펴보세요</h1>
            <p className="mt-2 text-muted-foreground">
              경매·공매물건을 모으고, 입찰가격과 실제 거래를 한눈에.
            </p>
          </div>
          <Badge
            variant="outline"
            className="gap-2 rounded-full bg-white px-3 py-2 font-normal"
          >
            <Circle className="size-2 fill-current" />
            {demo
              ? "샘플 8건 미리보기"
              : available
                ? "데이터 연결됨"
                : state === "error"
                  ? "연결 확인 필요"
                  : "데이터 연결 대기"}
          </Badge>
        </div>
        <form
          action="/properties"
          className="mx-auto mt-8 flex max-w-[880px] items-center gap-3 rounded-full bg-white px-5 py-3 shadow-subtle"
        >
          <input type="hidden" name="demo" value={demo ? "1" : "0"} />
          <div className="flex-1">
            <label htmlFor="dashboard-search" className="text-xs font-semibold">
              어떤 물건을 찾고 계신가요?
            </label>
            <Input
              id="dashboard-search"
              name="q"
              placeholder="물건명 또는 지역을 검색하세요"
              className="h-8 border-0 px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            aria-label="공매물건 검색"
            className="size-12 shrink-0 rounded-full bg-rausch text-white hover:bg-rausch-600"
          >
            <Search className="size-5" />
          </Button>
        </form>
      </section>
      <section
        aria-label="수집 현황"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        {stats.map((s) => (
          <Card
            key={s.label}
            className="gap-0 rounded-xl border-0 py-0 shadow-none"
          >
            <CardContent className="p-5">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="my-3 text-[28px] font-semibold">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.note}</p>
            </CardContent>
          </Card>
        ))}
      </section>
      <section>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2>{demo ? "가격 매력도가 높은 물건" : "최근 확인한 공매물건"}</h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {demo
                ? "가상의 실거래 비교로 살펴보는 급매 후보"
                : "마지막 수집 결과를 확인하세요"}
            </p>
          </div>
          <Button asChild variant="ghost" className="rounded-full">
            <Link href={`/properties${suffix}`}>
              전체 보기
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        {properties.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        ) : (
          <CollectionState state={state === "demo" ? "ready" : state} />
        )}
      </section>
      {!!ending.length && (
        <section>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2>입찰 마감이 가까워요</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                놓치기 전에 입찰 조건과 가격 이력을 검토해 보세요.
              </p>
            </div>
            <Badge
              variant="secondary"
              className="rounded-full bg-white px-3 py-1.5"
            >
              샘플 일정
            </Badge>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ending.map((p) => (
              <PropertyCard key={p.id} property={p} />
            ))}
          </div>
        </section>
      )}
      <section className="flex flex-wrap items-center justify-between gap-5 border-t pt-8">
        <div>
          <h2>공매 검토, 차근차근</h2>
          <p className="mt-2 text-muted-foreground">
            수집 → 가격 이력 → 실거래 비교 → 급매점수
          </p>
        </div>
        <p className="max-w-md text-xs leading-6 text-muted-foreground">
          {demo
            ? "카드를 눌러 가상의 거래 목록과 점수 산정근거를 살펴보세요. 모든 수치와 이미지는 디자인 확인을 위한 샘플입니다."
            : "실제 추정시장가·급매점수는 실거래 분석을 연결한 뒤 표시됩니다."}
        </p>
      </section>
    </div>
  );
}
