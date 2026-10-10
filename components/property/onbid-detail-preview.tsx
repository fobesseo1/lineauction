import Link from "next/link";
import { ArrowLeft, ArrowUpRight, MapPin, Gavel, TriangleAlert, ChartNoAxesColumn } from "lucide-react";
import { z } from "zod";
import { createPublicDetailClient as createClient } from "@/lib/supabase/public-detail";
import { locateAddress } from "@/lib/maps/geocode";
import { parcelAddress } from "@/lib/maps/parcel";
import { appraisalRatio } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { NaverMapPreview } from "@/components/naver-map-preview";
import { GeocodedMapPreview } from "@/components/geocoded-map-preview";
import { PriceAmount } from "./price-amount";
import { PriceAttractivenessDetails } from "./price-attractiveness-details";
import { DetailPreviewHeader } from "./detail-preview-header";
import { RealComparison } from "./real-comparison";
import { OnbidEvidence, onbidDetailSchema, officialOnbidUrl } from "./onbid-evidence";
import type { Property } from "@/types/property";

const comparisonSummarySchema = z.object({ status: z.literal("matched"), coverage: z.object({ complete: z.literal(true) }), trades: z.array(z.object({ date: z.string(), price: z.string().regex(/^\d+$/) })).min(1) });
type History = { id: string; checked_at: string; minimum_bid_price: string | null; appraisal_price: string | null; failed_bid_count: number | null; status: string | null };
const dateLabel = (value: string) => {
  const parts = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return ["year", "month", "day"].map(type => parts.find(part => part.type === type)?.value).join(".") + ".";
};

// Onbid detail in the same layout as the court detail; the full Onbid fields follow below.
export async function OnbidDetailPreview({ property: p, history }: { property: Property; history: History[] }) {
  const client = createClient();
  const [photoResult, comparisonResult, detailResult] = await Promise.all([
    client.from("property_media").select("id,path").eq("property_id", p.id).order("sort_order").order("id"),
    client.from("property_comparisons").select("*").eq("property_id", p.id).maybeSingle(),
    client.rpc("onbid_public_detail", { p_property_id: p.id }),
  ]);
  const parsedDetail = onbidDetailSchema.safeParse(detailResult.error ? null : detailResult.data);
  const detail = parsedDetail.success ? parsedDetail.data : null;
  const fields = detail?.fields ?? {};
  // Official photos: stored media first, then RPC photo links, then the list thumbnail.
  const photos = [...new Set([
    ...(photoResult.error ? [] : (photoResult.data ?? []).map(m => officialOnbidUrl(m.path))),
    ...(detail?.photos ?? []).map(m => officialOnbidUrl(m.url)),
    officialOnbidUrl(fields.thnlImgUrlAdr),
  ].filter((url): url is string => !!url))];
  const address = p.address || fields.zadrNm || [p.sido, p.sigungu, p.dong].filter(Boolean).join(" ") || p.title;
  const parcel = parcelAddress(p.address, fields.zadrNm, p.title);
  const mapQuery = parcel || address;
  const position = await locateAddress({ address: mapQuery, latitude: p.latitude, longitude: p.longitude });
  const mapUrl = `https://map.naver.com/p/search/${encodeURIComponent(mapQuery)}`;
  const comparison = comparisonSummarySchema.safeParse(comparisonResult.error ? null : comparisonResult.data);
  const latest = comparison.success ? comparison.data.trades[0] : null;
  const minimum = Number(p.minimum_bid_price), latestPrice = Number(latest?.price);
  const priceGap = latest && Number.isSafeInteger(minimum) && minimum > 0 && Number.isSafeInteger(latestPrice) && latestPrice > 0 ? (minimum / latestPrice - 1) * 100 : null;
  // Onbid stamps open-ended private-contract listings with a 2999 placeholder date.
  const openEnded = [p.bid_start_at, p.bid_end_at].some(date => date && new Date(date).getUTCFullYear() >= 2900);
  const bidPeriod = openEnded ? "상시 (수의계약)" : p.bid_start_at || p.bid_end_at ? `${formatDate(p.bid_start_at)} ~ ${formatDate(p.bid_end_at)}` : "확인 필요";
  const shownDate = (date: string | null) => date && new Date(date).getUTCFullYear() >= 2900 ? "상시 (수의계약)" : formatDate(date);
  const facts = [
    { label: "소재지", value: parcel || address },
    { label: "물건관리번호", value: p.source_property_id },
    { label: "공매조건번호", value: p.auction_condition_id },
    { label: "용도 · 처분", value: `${p.usage_type || "부동산"} · ${p.disposal_method || "온비드 공매"}` },
    ...(fields.orgNm ? [{ label: "공고기관", value: fields.orgNm }] : []),
    ...(p.exclusive_area !== null ? [{ label: "전용면적", value: `${p.exclusive_area}㎡` }] : []),
    ...(p.building_area !== null ? [{ label: "건물면적", value: `${p.building_area}㎡` }] : []),
    ...(p.land_area !== null ? [{ label: "토지면적", value: `${p.land_area}㎡` }] : []),
  ];
  // Every Onbid field the previous detail page showed, kept as-is below the summary.
  const details = [
    { label: "물건관리번호", value: p.source_property_id },
    { label: "공매조건번호", value: p.auction_condition_id },
    { label: "재산유형", value: p.asset_type },
    { label: "처분방식", value: p.disposal_method },
    { label: "진행상태", value: p.status },
    { label: "유찰횟수", value: p.failed_bid_count === null ? null : `${p.failed_bid_count}회` },
    { label: "입찰시작", value: shownDate(p.bid_start_at) },
    { label: "입찰마감", value: shownDate(p.bid_end_at) },
    { label: "토지면적", value: p.land_area === null ? null : `${p.land_area}㎡` },
    { label: "건물면적", value: p.building_area === null ? null : `${p.building_area}㎡` },
    { label: "최초수집", value: formatDate(p.first_seen_at) },
    { label: "마지막확인", value: formatDate(p.last_seen_at) },
  ];
  const changes = history.filter((row, index) => {
    const previous = history[index + 1];
    return !previous || ["minimum_bid_price", "appraisal_price", "failed_bid_count", "status"].some(key => row[key as keyof History] !== previous[key as keyof History]);
  });
  return <div className="-mt-5 space-y-5 md:-mt-6">
    <div className="flex items-center justify-between"><Button asChild variant="ghost" size="sm" className="-ml-3"><Link href="/properties?demo=0&source=onbid"><ArrowLeft className="size-4" />공매 목록</Link></Button><span className="text-xs text-muted-foreground">온비드 공매 · 조건 {p.auction_condition_id}</span></div>
    <div className="flex flex-wrap items-center gap-2">
      {priceGap !== null && priceGap > 0 && <Badge variant="outline" className="gap-1.5 border-rausch/20 bg-rausch/10 text-rausch-600"><TriangleAlert />가격 비교 주의</Badge>}
      <PriceAttractivenessDetails badge />
    </div>
    <DetailPreviewHeader photo={photos[0]} title={p.title} photosHref="#onbid-photos" photosLabel="온비드 사진 모아보기">
      <div className="mb-1.5 flex min-w-0 items-center gap-1.5 md:flex-wrap md:gap-2"><Badge variant="outline" className="shrink-0 rounded-full bg-white text-[10px] md:text-xs">{p.usage_type || "부동산"}</Badge><span className="min-w-0 truncate text-[10px] text-muted-foreground md:whitespace-normal md:text-xs">온비드 {p.source_property_id} · 조건 {p.auction_condition_id}</span></div>
      <h1 className="truncate text-xl leading-tight md:whitespace-normal md:text-[28px]" title={p.title}>{p.title}</h1>
      <div className="mt-1.5 space-y-1 md:mt-2"><p className="flex items-start gap-1.5 text-xs leading-normal text-muted-foreground md:text-sm"><MapPin className="mt-0.5 size-3 shrink-0 md:size-3.5" /><span className="min-w-0 line-clamp-2 md:line-clamp-none">{address}</span></p><p className="truncate text-right text-[10px] text-muted-foreground md:whitespace-normal md:text-[11px]">최신 업데이트:{dateLabel(p.last_seen_at)}</p></div>
    </DetailPreviewHeader>
    <Card className="gap-0 border-0 py-3 shadow-none"><CardContent className="flex flex-wrap items-center justify-between gap-3 px-5"><span className="flex items-center gap-2 text-sm font-medium"><ChartNoAxesColumn className="size-4 text-muted-foreground" />가격 매력도</span><div className="flex items-center gap-2"><Badge variant="secondary">점수 산정 전</Badge><PriceAttractivenessDetails /></div></CardContent></Card>
    <Card className="gap-0 overflow-hidden border-0 py-0 shadow-none">
      <CardContent className="p-0"><div className="grid md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_1.5fr] [&>div]:border-border [&>div+div]:border-t md:[&>div+div]:border-t-0 md:[&>div:nth-child(even)]:border-l md:[&>div:nth-child(n+3)]:border-t xl:[&>div:nth-child(n+3)]:border-t-0 xl:[&>div+div]:border-l">
        <div className="px-5 py-5"><Badge className="border-rausch/15 bg-rausch/10 text-rausch-600">현재 최저입찰가</Badge><div className="mt-2"><PriceAmount value={p.minimum_bid_price} className="text-[26px] font-bold leading-tight text-rausch" /></div></div>
        <div className="px-5 py-5"><p className="text-sm text-muted-foreground">감정평가금액</p><div className="mt-2"><PriceAmount value={p.appraisal_price} className="text-2xl" /></div></div>
        <div className="px-5 py-5"><p className="text-sm text-muted-foreground">감정가 대비 최저가율</p><p className="mt-2 text-2xl font-semibold">{appraisalRatio(p.minimum_bid_price, p.appraisal_price) || "미산정"}</p></div>
        <div className="px-5 py-5">
          <p className="text-sm text-muted-foreground">최신 실거래가 대비 최저입찰가</p>
          <p className={`mt-2 text-2xl font-semibold ${priceGap !== null && priceGap > 0 ? "text-rausch" : ""}`}>{priceGap === null ? "미산정" : priceGap === 0 ? "동일" : `${Math.abs(priceGap).toFixed(1)}% ${priceGap > 0 ? "높음" : "낮음"}`}</p>
          {priceGap !== null && latest && <div className="mt-1 space-y-1 text-xs leading-4 text-muted-foreground">
            <p>실거래보다 <span className="font-bold text-foreground"><PriceAmount value={String(Math.abs(minimum - latestPrice))} /></span> <span className={priceGap > 0 ? "font-medium text-rausch" : "font-medium text-foreground"}>{priceGap > 0 ? "비쌈" : priceGap < 0 ? "저렴" : "동일"}</span></p>
            <p>최신실거래 <span className="font-bold text-foreground"><PriceAmount value={latest.price} /></span> <time dateTime={latest.date}>({latest.date.replaceAll("-", ".")})</time></p>
          </div>}
        </div>
      </div><div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t px-5 py-3"><span className="flex items-center gap-2"><Gavel className="size-4" /><strong>{p.status || "진행상태 확인 필요"}</strong></span><span><span className="text-muted-foreground">유찰 </span><strong>{p.failed_bid_count ?? "미확인"}{p.failed_bid_count !== null ? "회" : ""}</strong></span><span><span className="text-muted-foreground">입찰기간 </span><strong>{bidPeriod}</strong></span><Button asChild variant="outline" size="sm" className="ml-auto h-8"><a href="https://www.onbid.co.kr/" target="_blank" rel="noreferrer">온비드 원문 확인<ArrowUpRight className="size-3.5" /></a></Button></div></CardContent>
    </Card>
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)]">
      <div className="min-w-0 space-y-5"><RealComparison id={p.id} minimum={p.minimum_bid_price} snapshot={comparisonResult.error ? undefined : comparisonResult.data} compact />
        <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="space-y-3 px-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">위치</h2><Button asChild variant="outline" className="min-h-[44px]"><a href={mapUrl} target="_blank" rel="noreferrer">네이버 지도로 이동<ArrowUpRight className="size-5" /></a></Button></div>
          {position ? <NaverMapPreview {...position} title={p.title} compact /> : <GeocodedMapPreview queries={[...new Set([parcel, fields.cltrRadr].filter((q): q is string => !!q))]} area={[p.sido, p.sigungu, p.dong].filter(Boolean).join(" ") || p.address} title={p.title} label={address} mapUrl={mapUrl} />}
        </CardContent></Card>
      </div>
      <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="px-5"><h2 className="mb-4 text-lg font-semibold">물건 기본정보</h2><dl className="space-y-3">{facts.map(f => <div key={f.label} className="flex items-baseline justify-between gap-3 text-sm"><dt className="shrink-0 text-muted-foreground">{f.label}</dt><dd className="text-right font-medium">{f.value}</dd></div>)}</dl></CardContent></Card>
    </div>
    <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="px-5"><h2 className="mb-4 text-lg font-semibold">공매 상세정보</h2><dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">{details.map(d => <div key={d.label}><dt className="text-xs text-muted-foreground">{d.label}</dt><dd className="mt-1 font-medium">{d.value || "미제공"}</dd></div>)}</dl></CardContent></Card>
    <OnbidEvidence detail={detail} />
    <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="px-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">가격·입찰 변경이력</h2><span className="text-xs text-muted-foreground">확인된 가격과 입찰 조건의 변화</span></div><Table><TableHeader><TableRow><TableHead>기준일</TableHead><TableHead>최저입찰가</TableHead><TableHead>감정가</TableHead><TableHead>유찰</TableHead><TableHead>진행상태</TableHead></TableRow></TableHeader><TableBody>{changes.map(h => <TableRow key={h.id}><TableCell className="whitespace-nowrap">{new Date(h.checked_at).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}</TableCell><TableCell className="whitespace-nowrap font-semibold"><PriceAmount value={h.minimum_bid_price} /></TableCell><TableCell className="whitespace-nowrap"><PriceAmount value={h.appraisal_price} /></TableCell><TableCell>{h.failed_bid_count === null ? "—" : `${h.failed_bid_count}회`}</TableCell><TableCell>{h.status || "확인 필요"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
    {!!photos.length && <section id="onbid-photos" className="scroll-mt-8 rounded-xl bg-white p-5"><div className="mb-3 flex items-center gap-3"><h2 className="text-lg font-semibold">물건 사진</h2><span className="text-xs text-muted-foreground">{photos.length}장</span></div><div className="flex flex-wrap gap-3">{photos.map((url, i) => <a key={url} href={url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-muted" aria-label={`온비드 사진 ${i + 1} 크게 보기`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- official Onbid file URLs are served as-is */}
      <img src={url} alt={`${p.title} 온비드 사진 ${i + 1}`} loading="lazy" className="h-[90px] w-[120px] object-contain" /></a>)}</div><p className="mt-3 text-xs text-muted-foreground"><a href="https://www.onbid.co.kr/" target="_blank" rel="noreferrer">사진: 온비드 공식 자료 참고</a></p></section>}
  </div>;
}
