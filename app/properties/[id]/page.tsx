import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { loadPropertyDetail } from "@/lib/services/dashboard-service";
import { DemoNotice } from "@/components/demo-notice";
import { formatWon, appraisalRatio } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RealComparison } from "@/components/property/real-comparison";
import { CourtEvidence } from "@/components/property/court-evidence";
import { CourtDetailPreview } from "@/components/property/court-detail-preview";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
export const dynamic = "force-dynamic";
export default async function PropertyDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const result = await loadPropertyDetail(
    (await params).id,
    (await searchParams).demo,
  );
  if (!result) notFound();
  const { property: p, history } = result;
  if(!p.demo && p.source === "court" && ["서울특별시", "경기도"].includes(p.sido??"")) return <CourtDetailPreview property={p} history={history}/>;
  const details = [
    { label: "물건관리번호", value: p.source_property_id },
    { label: p.source === "court" ? "물건번호" : "공매조건번호", value: p.auction_condition_id },
    { label: "재산유형", value: p.asset_type },
    { label: "처분방식", value: p.disposal_method },
    { label: "진행상태", value: p.status },
    {
      label: "유찰횟수",
      value: p.failed_bid_count === null ? null : `${p.failed_bid_count}회`,
    },
    { label: "입찰시작", value: formatDate(p.bid_start_at) },
    { label: "입찰마감", value: formatDate(p.bid_end_at) },
    {
      label: "토지면적",
      value: p.land_area === null ? null : `${p.land_area}㎡`,
    },
    {
      label: "건물면적",
      value: p.building_area === null ? null : `${p.building_area}㎡`,
    },
    { label: "최초수집", value: formatDate(p.first_seen_at) },
    { label: "마지막확인", value: formatDate(p.last_seen_at) },
  ];
  return (
    <div className="space-y-10">
      <DemoNotice active={!!p.demo} />
      <Button asChild variant="ghost" className="-ml-3 rounded-full">
        <Link href={p.demo ? "/properties?demo=1" : "/properties?demo=0"}>
          <ArrowLeft className="size-4" />
          목록으로
        </Link>
      </Button>
      <section>
        <Badge variant="outline" className="mb-4 rounded-full bg-white">
          {p.usage_type || "부동산"}
        </Badge>
        <h1>{p.title}</h1>
        <p className="mt-3 flex items-center gap-2 text-muted-foreground">
          <MapPin className="size-4" />
          {p.address ||
            [p.sido, p.sigungu, p.dong].filter(Boolean).join(" ") ||
            "소재지 미제공"}
        </p>
      </section>
      {!p.demo && p.source === "court" && <CourtEvidence property={p} />}
      {p.demo && (
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="relative w-full min-w-0 overflow-hidden rounded-xl aspect-[4/3]">
            <Image
              src={p.demo.image}
              alt={`${p.title} 가상 부동산 이미지`}
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 60vw"
              className="object-cover"
              style={{ objectPosition: p.demo.imagePosition }}
            />
            <Badge className="absolute bottom-5 left-5 rounded-full bg-white text-foreground">
              AI 생성 · 가상 물건 이미지
            </Badge>
          </div>
          <Card className="border-0 shadow-none">
            <CardContent className="flex h-full flex-col justify-between gap-8 p-7">
              <div>
                <Badge variant="secondary" className="rounded-full">
                  샘플 분석
                </Badge>
                <p className="mt-5 text-muted-foreground">시장가 대비 할인율</p>
                <p className="mt-2 text-5xl font-semibold">
                  {p.demo.analysis.discountRate.toFixed(1)}
                  <span className="text-2xl">%</span>
                </p>
                <p className="mt-3 text-muted-foreground">
                  추정시장가와 최저입찰가의 단순 비교
                </p>
              </div>
              <dl className="space-y-4">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">추정시장가</dt>
                  <dd className="font-semibold">
                    {formatWon(p.demo.analysis.marketPrice)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">최저입찰가</dt>
                  <dd className="font-semibold">
                    {formatWon(p.minimum_bid_price)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-t pt-4">
                  <dt>예상 가격차</dt>
                  <dd className="font-semibold">
                    {formatWon(p.demo.analysis.priceGap)}
                  </dd>
                </div>
              </dl>
              <div className="flex items-center justify-between rounded-xl bg-muted p-5">
                <div>
                  <p className="font-semibold">
                    급매점수 {p.demo.analysis.dealGrade}등급
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    화면 확인용 예시 점수
                  </p>
                </div>
                <p className="text-3xl font-semibold">
                  {p.demo.analysis.dealScore}
                  <span className="text-sm text-muted-foreground"> / 100</span>
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: "감정평가금액", value: formatWon(p.appraisal_price) },
          { label: "현재 최저입찰가", value: formatWon(p.minimum_bid_price) },
          {
            label: "감정가 대비 최저가율",
            value:
              appraisalRatio(p.minimum_bid_price, p.appraisal_price) ||
              "미산정",
          },
        ].map((item) => (
          <Card key={item.label} className="border-0 shadow-none">
            <CardContent>
              <p className="text-muted-foreground">{item.label}</p>
              <p className="mt-4 text-2xl font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      {p.demo && (
        <div className="grid items-start gap-6 lg:grid-cols-2">
          <Card className="border-0 shadow-none">
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <h2>실거래 비교 예시</h2>
                <Badge variant="secondary" className="rounded-full">
                  가상 거래
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {p.demo.complexName} · {p.demo.analysis.marketPriceMethod}
              </p>
              <div className="space-y-4">
                {[
                  {
                    label: "최저입찰가",
                    value: p.minimum_bid_price || "0",
                    dark: true,
                  },
                  {
                    label: "추정시장가",
                    value: p.demo.analysis.marketPrice,
                    dark: false,
                  },
                  {
                    label: "감정가",
                    value: p.appraisal_price || "0",
                    dark: false,
                  },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span>{item.label}</span>
                      <span className="font-medium">
                        {formatWon(item.value)}
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${item.dark ? "bg-foreground" : "bg-stone-300"}`}
                        style={{
                          width: `${Math.min(100, (Number(item.value) / Number(p.appraisal_price)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>계약일</TableHead>
                    <TableHead>면적</TableHead>
                    <TableHead>층</TableHead>
                    <TableHead className="text-right">거래가</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.demo.transactions.map((t) => (
                    <TableRow key={t.date}>
                      <TableCell className="whitespace-nowrap">
                        {t.date}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {t.area.toFixed(1)}㎡
                      </TableCell>
                      <TableCell>{t.floor}층</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {formatWon(t.price)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground">
                전체 비교 거래 {p.demo.analysis.transactionCount}건 중 4건
                표시를 가정한 예시입니다. 실제 국토부 데이터가 아닙니다.
              </p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-none">
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <h2>점수 산정근거</h2>
                <Badge variant="secondary" className="rounded-full">
                  {p.demo.analysis.dealGrade} · {p.demo.analysis.dealScore}점
                </Badge>
              </div>
              {p.demo.analysis.scoreBreakdown.map((s) => (
                <div key={s.label}>
                  <div className="flex justify-between gap-3">
                    <p className="font-medium">{s.label}</p>
                    <p className="font-semibold">
                      {s.score}
                      <span className="text-xs font-normal text-muted-foreground">
                        {" "}
                        / {s.maximum}
                      </span>
                    </p>
                  </div>
                  <div className="my-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground"
                      style={{ width: `${(s.score / s.maximum) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                가상 점수이며 실제 수익이나 투자 적합성을 평가한 결과가
                아닙니다.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      <section>
        <h2 className="mb-5">물건 기본정보</h2>
        <Card className="border-0 shadow-none">
          <CardContent>
            <dl className="grid gap-x-10 gap-y-5 md:grid-cols-2 lg:grid-cols-3">
              {details.map((d) => (
                <div key={d.label}>
                  <dt className="text-xs text-muted-foreground">{d.label}</dt>
                  <dd className="mt-1 font-medium">{d.value || "미제공"}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </section>
      <section>
        <h2 className="mb-5">가격 및 입찰 변경이력</h2>
        <div className="rounded-xl bg-white p-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>확인일</TableHead>
                <TableHead>최저입찰가</TableHead>
                <TableHead>감정가</TableHead>
                <TableHead>유찰</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>마감</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((h) => (
                <TableRow key={h.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatDate(h.checked_at)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatWon(h.minimum_bid_price)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatWon(h.appraisal_price)}
                  </TableCell>
                  <TableCell>{h.failed_bid_count ?? "—"}</TableCell>
                  <TableCell>{h.status || "미제공"}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {p.source === "court" ? "마감시각 미확인" : formatDate(h.bid_end_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      {!p.demo && <RealComparison id={p.id} minimum={p.minimum_bid_price} />}
    </div>
  );
}
