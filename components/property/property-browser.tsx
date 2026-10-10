"use client";
import { useState } from "react";
import {useRouter,useSearchParams} from 'next/navigation';
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PropertyCard } from "./property-card";
import type { PropertyListing } from "@/types/listing";
type Choice = { value: string; label: string };
function FilterSelect({
  label,
  value,
  onChange,
  choices,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  choices: Choice[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-label={label}
        className="h-10 w-full rounded-lg bg-white shadow-none"
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {choices.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            {c.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function PropertyBrowser({
  properties,
  initialQuery,
  initialSource,
}: {
  properties: PropertyListing[];
  initialQuery: string;
  initialSource?: string;
}) {
  const defaultRegion = properties.some((p) => p.demo) ? "all" : "seoul-gyeonggi";
  const router=useRouter(),params=useSearchParams();
  const changeSource=(value:string)=>{setSource(value);setVisibleCount(24);const next=new URLSearchParams(params.toString());next.set('source',value);router.push(`/properties?${next.toString()}`);};
  const [visibleCount, setVisibleCount] = useState(24);
  const [source,setSource] = useState(initialSource==='court'||initialSource==='onbid'?initialSource:'all');
  const [lifecycle, setLifecycle] = useState("active");
  const [query, setQuery] = useState(initialQuery),
    [region, setRegion] = useState(defaultRegion),
    [usage, setUsage] = useState("all"),
    [sort, setSort] = useState(
      properties.some((p) => p.demo) ? "score" : "recent",
    ),
    [maxBid, setMaxBid] = useState(""),
    [minFailed, setMinFailed] = useState("");
  const regions = [
    ...new Set(properties.map((p) => p.sido).filter((v): v is string => !!v)),
  ];
  const usages = [
    ...new Set(
      properties.map((p) => p.usage_type).filter((v): v is string => !!v),
    ),
  ];
  const filtered = properties.filter(
    (p) =>
      (source === 'all' || p.source === source) &&
      (lifecycle === "all" || (lifecycle === "closed" ? p.lifecycle_state === "closed" : p.lifecycle_state !== "closed")) &&
      [p.title, p.address, p.sido, p.sigungu, p.dong]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (region === "all" || (region === "seoul-gyeonggi"
        ? p.source==='onbid' ? ['서울특별시','경기도'].includes(p.sido??'') : !!p.address && p.address.split(" / ").every(address => /^(서울특별시|경기도)\s/.test(address.trim()))
        : p.sido === region)) &&
      (usage === "all" || p.usage_type === usage) &&
      (!maxBid ||
        (p.minimum_bid_price !== null &&
          BigInt(p.minimum_bid_price) <= BigInt(maxBid))) &&
      (!minFailed ||
        (p.failed_bid_count !== null &&
          p.failed_bid_count >= Number(minFailed))),
  );
  filtered.sort((a, b) => {
    if (sort === "score")
      return (
        (b.demo?.analysis.dealScore ?? 0) - (a.demo?.analysis.dealScore ?? 0)
      );
    if (sort === "discount")
      return (
        (b.demo?.analysis.discountRate ?? 0) -
        (a.demo?.analysis.discountRate ?? 0)
      );
    if (sort === "price") {
      if (a.minimum_bid_price === null) return 1;
      if (b.minimum_bid_price === null) return -1;
      const diff = BigInt(a.minimum_bid_price) - BigInt(b.minimum_bid_price);
      return diff < 0n ? -1 : diff > 0n ? 1 : 0;
    }
    if (sort === "deadline")
      return (
        (a.bid_end_at ? Date.parse(a.bid_end_at) : Infinity) -
        (b.bid_end_at ? Date.parse(b.bid_end_at) : Infinity)
      );
    return Date.parse(b.first_seen_at) - Date.parse(a.first_seen_at);
  });
  const reset = () => {
    setQuery("");
    setLifecycle("active");
    setRegion(defaultRegion);
    setUsage("all");
    setMaxBid("");
    setMinFailed("");
    setSort(properties.some((p) => p.demo) ? "score" : "recent");
  };
  return (
    <div className="space-y-8">
      <div className="space-y-4 rounded-xl bg-white p-5">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4" />
          <h2 className="text-base">검색 조건</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
          <Input
            aria-label="물건명 또는 지역 검색"
            placeholder="물건명 또는 지역 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-10 shadow-none"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect label="경매·공매 구분" value={source} onChange={changeSource} choices={[{value:'all',label:'경매·공매 전체'},{value:'court',label:'법원 경매'},{value:'onbid',label:'온비드 공매'}]} />
          <FilterSelect label="진행 구분" value={lifecycle} onChange={setLifecycle} choices={[{value:"active",label:"진행·재확인 대상"},{value:"closed",label:"종료 확인 물건"},{value:"all",label:"전체 이력 포함"}]} />
          <FilterSelect
            label="지역"
            value={region}
            onChange={setRegion}
            choices={[
              { value: "seoul-gyeonggi", label: "서울·경기" },
              { value: "all", label: "모든 지역" },
              ...regions.map((v) => ({ value: v, label: v })),
            ]}
          />
          <FilterSelect
            label="물건종류"
            value={usage}
            onChange={setUsage}
            choices={[
              { value: "all", label: "모든 물건종류" },
              ...usages.map((v) => ({ value: v, label: v })),
            ]}
          />
          <Input
            aria-label="최대 입찰가격 원"
            placeholder="최대 입찰가격 (원)"
            inputMode="numeric"
            value={maxBid}
            onChange={(e) => setMaxBid(e.target.value.replace(/\D/g, ""))}
            className="h-10 shadow-none"
          />
          <Input
            aria-label="최소 유찰횟수"
            placeholder="최소 유찰횟수"
            inputMode="numeric"
            value={minFailed}
            onChange={(e) => setMinFailed(e.target.value.replace(/\D/g, ""))}
            className="h-10 shadow-none"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={reset}
          className="rounded-full"
        >
          조건 초기화
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2>{source==='court'?'법원 경매물건':source==='onbid'?'온비드 공매물건':'경매·공매물건'}</h2>
          <Badge variant="secondary" className="rounded-full bg-white">
            {filtered.length}건
          </Badge>
        </div>
        <div className="w-44">
          <FilterSelect
            label="정렬"
            value={sort}
            onChange={setSort}
            choices={[
              ...(properties.some((p) => p.demo)
                ? [
                    { value: "score", label: "급매점수순" },
                    { value: "discount", label: "할인율순" },
                  ]
                : []),
              { value: "recent", label: "최근 등록순" },
              { value: "price", label: "최저가격순" },
              { value: "deadline", label: "마감임박순" },
            ]}
          />
        </div>
      </div>
      {filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.slice(0, visibleCount).map((p) => (
            <PropertyCard key={p.id} property={p} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-white px-6 py-14 text-center">
          <p className="text-lg font-medium">
            검색 조건에 맞는 물건이 없습니다
          </p>
          <p className="mt-2 text-muted-foreground">
            지역이나 가격 범위를 조정해 보세요.
          </p>
          <Button
            variant="outline"
            className="mt-5 rounded-full"
            onClick={reset}
          >
            전체 물건 보기
          </Button>
        </div>
      )}
      {filtered.length > visibleCount && <div className="text-center"><Button variant="outline" onClick={() => setVisibleCount(count => count + 24)}>물건 더 보기 ({visibleCount} / {filtered.length})</Button></div>}
      <p className="text-xs text-muted-foreground">
        {properties.some((p) => p.demo)
          ? "가상 물건 8건 · 이미지와 분석값은 화면 확인용 샘플입니다."
          : `DB에서 불러온 ${properties.length.toLocaleString("ko-KR")}건 내 검색 · 건물면적은 전용면적으로 간주하지 않습니다.`}
      </p>
    </div>
  );
}
