import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, MapPin, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatWon, appraisalRatio } from "@/lib/utils/money";
import { formatDate } from "@/lib/utils/date";
import type { PropertyListing } from "@/types/listing";
export function PropertyCard({ property: p }: { property: PropertyListing }) {
  const preview = p.demo;
  return (
    <Link
      href={`/properties/${p.id}${preview ? "?demo=1" : "?demo=0"}`}
      className="group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      <Card className="h-full gap-0 overflow-hidden rounded-xl border-0 py-0 shadow-none">
        {!preview && p.cover_image && <div className="relative aspect-[4/3] overflow-hidden rounded-xl">
          <Image src={p.cover_image} alt={`${p.title} 법원 공개 사진`} fill sizes="(max-width: 640px) 100vw, 33vw" className="object-cover" />
          <Badge className="absolute bottom-3 right-3 bg-white text-foreground">법원 공개 사진</Badge>
        </div>}
        {preview && (
          <div className="relative aspect-square overflow-hidden rounded-xl">
            <Image
              src={preview.image}
              alt={`${p.usage_type} AI 생성 샘플 이미지`}
              fill
              sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw"
              style={{ objectPosition: preview.imagePosition }}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            />
            <Badge className="absolute left-3 top-3 rounded-full bg-white px-3 py-1.5 text-hof hover:bg-white">
              {preview.analysis.dealGrade}등급 · {preview.analysis.dealScore}점
            </Badge>
            <Badge
              variant="secondary"
              className="absolute bottom-3 right-3 rounded-full bg-white/90 text-[11px] font-normal"
            >
              AI 샘플 이미지
            </Badge>
          </div>
        )}
        <CardContent className="space-y-4 p-4">
          {p.lifecycle_state === "needs-recheck" && <Badge variant="outline">목록 미관측 · 재확인 필요</Badge>}
          {p.lifecycle_state === "closed" && <Badge variant="secondary">종료 확인 · {p.lifecycle_reason}</Badge>}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">
                {p.usage_type || "부동산"}
                {p.exclusive_area ? ` · ${p.exclusive_area}㎡` : ""}
              </p>
              <h3 className="line-clamp-1 font-semibold">{p.title}</h3>
            </div>
            <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground" />
          </div>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="size-3" />
            {[p.sido, p.sigungu, p.dong].filter(Boolean).join(" ") ||
              "소재지 미제공"}
          </p>
          <div>
            <p className="text-xs text-muted-foreground">최저입찰가</p>
            <p className="mt-1 text-xl font-semibold">
              {formatWon(p.minimum_bid_price)}
            </p>
            {preview && (
              <p className="mt-1 text-xs text-muted-foreground">
                추정시장가 {formatWon(preview.analysis.marketPrice)}{" "}
                <span className="ml-1 font-semibold text-hof">
                  · {preview.analysis.discountRate.toFixed(1)}% 할인
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
            <span>
              감정가 대비{" "}
              {appraisalRatio(p.minimum_bid_price, p.appraisal_price) ||
                "미산정"}
            </span>
            <span>유찰 {p.failed_bid_count ?? "—"}회</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="size-3.5 shrink-0" />
            <span>{p.bid_end_at ? `${formatDate(p.bid_end_at)} 마감` : p.source === "court" ? "매각기일은 상세에서 확인" : "마감시각 미제공"}</span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
