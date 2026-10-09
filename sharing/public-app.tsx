"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";
import { propertySchema, type Property } from "@/types/property";
import { PropertyBrowser } from "@/components/property/property-browser";
import { CourtDetailPreview } from "@/components/property/court-detail-preview";
import { DashboardSearch } from "@/components/property/dashboard-search";
import { VerifiedExamples } from "@/components/property/verified-examples";
import { mapAddress } from "@/lib/maps/address";
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
    db.from("property_media").select("id,path,width,height").eq("property_id", id).order("sort_order").order("id"),
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
  const [mapPositions,setMapPositions]=useState<Record<string,{latitude:number;longitude:number}>>({});
  useEffect(()=>{let active=true;fetch(`${config.basePath}/maps/positions.json`).then(r=>{if(!r.ok)throw Error("Map positions unavailable");return r.json();}).then(data=>{if(active)setMapPositions(data);}).catch(()=>{});return()=>{active=false;};},[]);
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

  return <>
    <header className="sticky top-0 z-30 border-b bg-white"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-10">
      <Link href="/dashboard" aria-label="선경매 홈"><Image src={`${config.basePath}/brand/lineauction-logo.svg`} alt="선경매 LINE AUCTION" className="w-[110px] sm:w-[145px] md:w-[170px]" width={540} height={220} /></Link>
      <nav className="flex gap-3 text-xs font-medium sm:gap-5 sm:text-sm" aria-label="주 메뉴"><Link href="/dashboard" aria-current={route === "/dashboard" ? "page" : undefined}>홈</Link><Link href="/properties" aria-current={route.startsWith("/properties") ? "page" : undefined}>경매물건 찾기</Link><Link href="/test" aria-current={route === "/test" ? "page" : undefined}>테스트</Link></nav>
    </div></header>
    <main id="main" className="mx-auto min-h-[75vh] max-w-[1440px] px-5 py-8 md:px-10 md:py-10">
      {error ? <Card role="alert"><CardContent><p>{error}</p><Button className="mt-4" onClick={reload}>다시 불러오기</Button></CardContent></Card> : detailId ? detail ? <>{detail.warning && <p role="alert" className="mb-6 text-sm">{detail.warning}</p>}<CourtDetailPreview property={detail.property} history={detail.history} photos={detail.photos} comparison={detail.comparison} position={detail.property.latitude!==null&&detail.property.longitude!==null?{latitude:detail.property.latitude,longitude:detail.property.longitude}:mapPositions[mapAddress((detail.property.address??"").split(" / ")[0])]??null} /></> : <p role="status">물건 상세를 불러오는 중입니다…</p> : !loaded ? <p role="status">서울·경기 경매물건을 불러오는 중입니다…</p> : route === "/test" ? <VerifiedExamples properties={properties}/> : route === "/properties" ? <div className="space-y-7"><div><h1>경매물건 찾기</h1><p className="mt-2 text-muted-foreground">지역과 가격으로 좁혀보고, 사진과 실거래를 확인하세요.</p></div><PropertyBrowser properties={properties} initialQuery="" /></div> : <DashboardSearch properties={properties}/> }
    </main><footer className="border-t px-5 py-7 text-xs leading-5 text-muted-foreground"><div className="mx-auto max-w-[1360px]">선경매 · LINE AUCTION<br/>출처: 대한민국 법원경매정보 · 국토교통부 실거래가 공개시스템. 입찰 일정·권리·가격은 공식 원문에서 재확인하세요.{checkedAt&&<p className="mt-2 text-[11px]">최종 자료 조회: {checkedAt}</p>}</div></footer>
  </>;
}
