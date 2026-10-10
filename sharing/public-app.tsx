"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import dynamic from 'next/dynamic';
import { createClient } from "@supabase/supabase-js";
import { propertySchema, type Property } from "@/types/property";
import { PagedCatalog } from "@/components/property/paged-catalog";
import { queryCatalog } from "@/lib/catalog-query";
import type { CatalogFilters } from "@/types/catalog";
import { PropertyCard } from "@/components/property/property-card";
import { VerifiedExamples } from "@/components/property/verified-examples";
import { mapAddress } from "@/lib/maps/address";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Link from "@/sharing/link";
import { setDetailPrefetch } from "@/sharing/prefetch";
import config from "@/sharing/public-config.json";
import { inPublicScope } from "@/sharing/scope";

const db = createClient(config.url, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
const CourtDetailPreview=dynamic(()=>import('@/components/property/court-detail-preview').then(module=>module.CourtDetailPreview),{loading:()=> <p role="status">물건 상세 화면을 불러오는 중입니다…</p>});
const asset = (path: string | null | undefined) => path?.startsWith("/") ? `${config.basePath}${path}` : path;
const photoChecks=new Map<string,Promise<boolean>>();
async function publishedPhoto(path:string){
 const url=asset(path);if(!url)return false;
 let check=photoChecks.get(url);if(!check){check=fetch(url,{method:'HEAD',cache:'force-cache'}).then(response=>response.ok&&(response.headers.get('content-type')??'').startsWith('image/')).catch(()=>false);photoChecks.set(url,check);}
 return check;
}
const readError = () => new Error("자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.");
type History = { id: string; checked_at: string; minimum_bid_price: string | null; appraisal_price: string | null; failed_bid_count: number | null; status: string | null };
type Detail = { property: Property; history: History[]; photos: { id: string; path: string; width: number; height: number }[]; comparison: unknown; warning: string | null };

async function listProperties() {
  const ids=["310d56e1-d6c4-4fef-970e-a844aa7b060b","0f28af10-adca-4627-9a5d-7d9a83c33db3","25641d71-b171-4b85-bb9f-fc90d4a1d1a7","7d617de7-e33d-4bda-a370-9c636d28eea7"];
  const {data,error}=await db.from('properties_catalog').select('*').in('id',ids).eq('source','court');
  if(error)throw readError();return data.map(row=>{const p=propertySchema.parse(row);return {...p,cover_image:asset(p.cover_image)};}).filter(p=>inPublicScope(p.address));
}
async function loadPublicPage(filters:CatalogFilters,signal:AbortSignal) {
 const scoped={...filters,region:filters.region==='all'?'seoul-gyeonggi':filters.region};
 const page=await queryCatalog(db,scoped,signal);return {...page,items:page.items.map(p=>({...p,cover_image:asset(p.cover_image)}))};
}
async function readDetail(id: string): Promise<Detail> {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("올바르지 않은 물건 주소입니다.");
  const [property, history, photos, comparison] = await Promise.all([
    db.from("properties_catalog").select("*").eq("id", id).in("sido", ["서울특별시", "경기도"]).maybeSingle(),
    db.from("property_history_public").select("*").eq("property_id", id).order("checked_at", { ascending: false }).limit(50),
    db.from("property_media").select("id,path,width,height").eq("property_id", id).order("sort_order").order("id"),
    db.from("property_comparisons").select("*").eq("property_id", id).maybeSingle(),
  ]);
  if (property.error) throw readError();
  if (!property.data) throw new Error("해당 물건을 찾을 수 없습니다. 목록에서 다시 선택해 주세요.");
  if (property.data.source==='court'&&!inPublicScope(property.data.address)) throw new Error("공개 조회 범위에 포함되지 않은 물건입니다.");
  const published=await Promise.all((photos.data??[]).map(async p=>await publishedPhoto(p.path)?{...p,path:asset(p.path)!}:null));
  return { property: propertySchema.parse(property.data), history: history.data ?? [], photos: published.filter(p=>p!==null), comparison: comparison.error ? null : comparison.data, warning: history.error || photos.error || comparison.error ? "일부 사진·이력·실거래 자료를 불러오지 못했습니다. 새로고침해 주세요." : null };
}
// Visible cards warm their detail so a click renders without waiting on Supabase.
const DETAIL_TTL=60_000,PREFETCH_CONCURRENCY=2;
const detailCache=new Map<string,{at:number;promise:Promise<Detail>}>();
function cachedDetail(id:string){
 const hit=detailCache.get(id);if(hit&&Date.now()-hit.at<DETAIL_TTL)return hit.promise;
 const promise=readDetail(id);const entry={at:Date.now(),promise};detailCache.set(id,entry);
 promise.then(value=>{const first=value.photos[0]?.path;if(first)new window.Image().src=first;},()=>{if(detailCache.get(id)===entry)detailCache.delete(id);});
 return promise;
}
const prefetchQueue:string[]=[];let prefetchActive=0,detailCodeWarmed=false;
function pumpPrefetch(){
 while(prefetchActive<PREFETCH_CONCURRENCY&&prefetchQueue.length){
  const id=prefetchQueue.shift()!;prefetchActive++;
  cachedDetail(id).catch(()=>{}).finally(()=>{prefetchActive--;pumpPrefetch();});
 }
}
function prefetchDetail(id:string){
 if(!detailCodeWarmed){detailCodeWarmed=true;void import('@/components/property/court-detail-preview').catch(()=>{});void fetch(`${config.basePath}/maps/positions.json`,{cache:'force-cache'}).catch(()=>{});}
 const hit=detailCache.get(id);if((hit&&Date.now()-hit.at<DETAIL_TTL)||prefetchQueue.includes(id))return;
 prefetchQueue.push(id);pumpPrefetch();
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
  useEffect(()=>{if(!route.startsWith('/properties/'))return;let active=true;fetch(`${config.basePath}/maps/positions.json`,{cache:'force-cache'}).then(r=>{if(!r.ok)throw Error("Map positions unavailable");return r.json();}).then(data=>{if(active)setMapPositions(data);}).catch(()=>{});return()=>{active=false;};},[route]);
  useEffect(() => {
    // Back to the bare home URL (no hash) must return to the dashboard too.
    const update = () => { setRoute(location.hash.startsWith("#/") ? location.hash.slice(1).split("?")[0] : "/dashboard"); setDetail(null); setError(null); window.scrollTo(0, 0); };
    update(); window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    let active = true;
    if(route!=="/test")return;
    listProperties().then(rows => { if (active) { setProperties(rows); setLoaded(true); setCheckedAt(new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [refresh,route]);
  const detailId = route.startsWith("/properties/") ? route.split("/")[2] : null;
  useEffect(() => {
    if (!detailId) return;
    let active = true;
    cachedDetail(detailId).then(value => { if (active) setDetail(value); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [detailId, refresh]);
  useEffect(() => { setDetailPrefetch(prefetchDetail); return () => setDetailPrefetch(null); }, []);
  const reload = () => { if (detailId) detailCache.delete(detailId); setError(null); setLoaded(false); setDetail(null); setRefresh(n => n + 1); };

  return <>
    <header className="sticky top-0 z-30 border-b bg-white"><div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-4 md:px-10">
      <Link href="/dashboard" aria-label="선경매 홈"><Image src={`${config.basePath}/brand/lineauction-logo.svg`} alt="선경매 LINE AUCTION" className="w-[110px] sm:w-[145px] md:w-[170px]" width={540} height={220} /></Link>
      <nav className="flex gap-3 text-xs font-medium sm:gap-5 sm:text-sm" aria-label="주 메뉴"><Link href="/dashboard" aria-current={route === "/dashboard" ? "page" : undefined}>홈</Link><Link href="/properties" aria-current={route.startsWith("/properties") ? "page" : undefined}>경매물건 찾기</Link><Link href="/test" aria-current={route === "/test" ? "page" : undefined}>테스트</Link></nav>
    </div></header>
    <main id="main" className="mx-auto min-h-[75vh] max-w-[1440px] px-5 py-8 md:px-10 md:py-10">
      {error ? <Card role="alert"><CardContent><p>{error}</p><Button className="mt-4" onClick={reload}>다시 불러오기</Button></CardContent></Card> : detailId ? detail ? <>{detail.warning && <p role="alert" className="mb-6 text-sm">{detail.warning}</p>}<PublicDetail property={detail.property} history={detail.history} photos={detail.photos} comparison={detail.comparison} position={detail.property.latitude!==null&&detail.property.longitude!==null?{latitude:detail.property.latitude,longitude:detail.property.longitude}:mapPositions[mapAddress((detail.property.address??"").split(" / ")[0])]??null} /></> : <p role="status">물건 상세를 불러오는 중입니다…</p> : route === "/test" ? loaded ? <VerifiedExamples properties={properties}/> : <p role="status">테스트 물건을 불러오는 중입니다…</p> : route === "/properties" ? <div className="space-y-7"><div><h1>경매물건 찾기</h1><p className="mt-2 text-muted-foreground">지역과 가격으로 좁혀보고, 사진과 실거래를 확인하세요.</p></div><PagedCatalog key="explore" explore loadPage={loadPublicPage} /></div> : <PagedCatalog key="dashboard" loadPage={loadPublicPage}/> }
    </main><footer className="border-t px-5 py-7 text-xs leading-5 text-muted-foreground"><div className="mx-auto max-w-[1360px]">선경매 · LINE AUCTION<br/>출처: 대한민국 법원경매정보 · 국토교통부 실거래가 공개시스템. 입찰 일정·권리·가격은 공식 원문에서 재확인하세요.{checkedAt&&<p className="mt-2 text-[11px]">최종 자료 조회: {checkedAt}</p>}</div></footer>
  </>;
}


function PublicDetail(props:React.ComponentProps<typeof CourtDetailPreview>){if(props.property.source==='court')return <CourtDetailPreview {...props}/>;const p=props.property;return <div className="space-y-6"><Link href="/properties">경매·공매물건 찾기</Link><h1>{p.title}</h1><p>온비드 공매 · 관리번호 {p.source_property_id} · 조건번호 {p.auction_condition_id}</p><div className="max-w-md"><PropertyCard property={p}/></div><p className="text-sm text-muted-foreground">공개 조회 가능한 기본정보입니다. 감정평가서 등 상세 공식 자료는 로컬 물건 상세에서 확인하세요.</p></div>;}
