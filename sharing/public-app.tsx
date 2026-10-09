"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { propertySchema, type Property } from "@/types/property";
import { PropertyBrowser } from "@/components/property/property-browser";
import { CourtDetailPreview } from "@/components/property/court-detail-preview";
import { PropertyCard } from "@/components/property/property-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "@/sharing/link";
import config from "@/sharing/public-config.json";
import mediaPaths from "@/sharing/available-media.json";
import { inPublicScope } from "@/sharing/scope";

const db = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const publishedMedia = new Set(mediaPaths);
const asset = (path: string | null | undefined) => path?.startsWith("/media/") && !publishedMedia.has(path) ? null : path?.startsWith("/") ? `${config.basePath}${path}` : path;
const readError = () => new Error("자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.");
type History = { id: string; checked_at: string; minimum_bid_price: string | null; appraisal_price: string | null; failed_bid_count: number | null; status: string | null };
type Detail = { property: Property; history: History[]; photos: { id: string; path: string; width: number; height: number }[]; comparison: unknown; warning: string | null };

async function listProperties() {
  const rows: Property[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("properties_catalog").select("*").eq("source", "court").in("sido", ["서울특별시", "경기도"]).order("last_seen_at", { ascending: false }).order("id").range(offset, offset + 499);
    if (error) throw readError();
    rows.push(...data.map(row => { const p = propertySchema.parse(row); return { ...p, cover_image: asset(p.cover_image) }; }).filter(p => inPublicScope(p.address)));
    if (data.length < 500) return rows;
  }
}
async function readDetail(id: string): Promise<Detail> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("올바르지 않은 물건 주소입니다.");
  const [property, history, photos, comparison] = await Promise.all([
    db.from("properties_catalog").select("*").eq("id", id).eq("source", "court").in("sido", ["서울특별시", "경기도"]).maybeSingle(),
    db.from("property_history_public").select("*").eq("property_id", id).order("checked_at", { ascending: false }).limit(50),
    db.from("property_media").select("id,path,width,height").eq("property_id", id).order("sort_order").order("id").limit(10),
    db.from("property_comparisons").select("*").eq("property_id", id).maybeSingle(),
  ]);
  if (property.error) throw readError();
  if (!property.data) throw new Error("해당 물건을 찾을 수 없습니다. 목록에서 다시 선택해 주세요.");
  if (!inPublicScope(property.data.address)) throw new Error("공개 조회 범위에 포함되지 않은 물건입니다.");
  return { property: propertySchema.parse(property.data), history: history.data ?? [], photos: (photos.data ?? []).filter(p => !!asset(p.path)).map(p => ({ ...p, path: asset(p.path)! })), comparison: comparison.error ? null : comparison.data, warning: history.error || photos.error || comparison.error ? "일부 사진·이력·실거래 자료를 불러오지 못했습니다. 새로고침해 주세요." : null };
}

export function PublicApp() {
  const [route, setRoute] = useState("/dashboard");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [checkedAt, setCheckedAt] = useState("");
  useEffect(() => {
    const update = () => { if (location.hash.startsWith("#/")) { setRoute(location.hash.slice(1).split("?")[0]); setDetail(null); setError(null); window.scrollTo(0, 0); } };
    update(); window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    let active = true;
    listProperties().then(rows => { if (active) { setProperties(rows); setLoaded(true); setCheckedAt(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [refresh]);
  const detailId = route.startsWith("/properties/") ? route.split("/")[2] : null;
  useEffect(() => {
    if (!detailId) return;
    let active = true;
    readDetail(detailId).then(value => { if (active) setDetail(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [detailId, refresh]);
  const reload = () => { setError(null); setLoaded(false); setDetail(null); setRefresh(n => n + 1); };
  const closed = properties.filter(p => p.lifecycle_state === "closed").length;
  const photographed = properties.filter(p => p.cover_image).length;
  return <>
    <header className="sticky top-0 z-30 border-b bg-white"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-10">
      <Link href="/dashboard" aria-label="선경매 대시보드"><Image src={`${config.basePath}/brand/lineauction-logo.svg`} alt="선경매 LINE AUCTION" className="w-[145px] md:w-[170px]" width={540} height={220} /></Link>
      <nav className="flex gap-5 text-sm font-medium" aria-label="주 메뉴"><Link href="/dashboard" aria-current={route === "/dashboard" ? "page" : undefined}>대시보드</Link><Link href="/properties" aria-current={route.startsWith("/properties") ? "page" : undefined}>경매물건 찾기</Link></nav>
      <Button variant="outline" size="sm" onClick={reload}>새로고침</Button>
    </div></header>
    <main id="main" className="mx-auto min-h-[75vh] max-w-[1440px] px-5 py-8 md:px-10 md:py-10">
      <p className="mb-8 text-xs leading-5 text-muted-foreground">서울·경기 법원경매 · 저장된 실제 자료 조회 {checkedAt && `· 조회 ${checkedAt}`}<br/>수집 자료는 계속 보완 중입니다. 사진은 최근 게시 시점까지 제공하며, 물건과 실거래는 새로고침하면 최신 DB 자료를 조회합니다.</p>
      {error ? <Card role="alert"><CardContent><p>{error}</p><Button className="mt-4" onClick={reload}>다시 불러오기</Button></CardContent></Card> : detailId ? detail ? <>{detail.warning && <p role="alert" className="mb-6 text-sm">{detail.warning}</p>}<CourtDetailPreview property={detail.property} history={detail.history} photos={detail.photos} comparison={detail.comparison} position={null} /></> : <p role="status">물건 상세를 불러오는 중입니다…</p> : !loaded ? <p role="status">서울·경기 경매물건을 불러오는 중입니다…</p> : route === "/properties" ? <div className="space-y-7"><div><h1>경매물건 찾기</h1><p className="mt-2 text-muted-foreground">지역과 가격으로 좁혀보고, 사진과 실거래를 확인하세요.</p></div><PropertyBrowser properties={properties} initialQuery="" /></div> : <div className="space-y-8">
        <div><p className="mb-2 text-xs text-muted-foreground">LINE AUCTION</p><h1>서울·경기 경매 리서치</h1><p className="mt-2 text-muted-foreground">공식 수집 자료와 실제 거래를 함께 살펴보세요.</p></div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[{ label: "전체 물건", value: properties.length }, { label: "종료 확인 제외 물건", value: properties.length - closed }, { label: "사진 확보 물건", value: photographed }, { label: "종료 확인", value: closed }].map(s => <Card key={s.label}><CardContent><p className="text-sm text-muted-foreground">{s.label}</p><p className="mt-3 text-2xl font-semibold">{s.value.toLocaleString()}<span className="ml-1 text-sm font-normal">건</span></p></CardContent></Card>)}</div>
        <div className="flex items-center justify-between"><h2>최근 확인된 물건</h2><Link href="/properties" className="text-sm underline">전체 물건 보기</Link></div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{properties.filter(p => p.lifecycle_state !== "closed").slice(0, 24).map(p => <PropertyCard key={p.id} property={p} />)}</div>
      </div>}
    </main><footer className="border-t px-5 py-7 text-xs leading-5 text-muted-foreground"><div className="mx-auto max-w-[1360px]">선경매 · LINE AUCTION<br/>출처: 대한민국 법원경매정보 · 국토교통부 실거래가 공개시스템. 입찰 일정·권리·가격은 공식 원문에서 재확인하세요.</div></footer>
  </>;
}
