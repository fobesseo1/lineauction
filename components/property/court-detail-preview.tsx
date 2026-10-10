import { locateAddress } from "@/lib/maps/geocode";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowUpRight, MapPin, Gavel, TriangleAlert, ChartNoAxesColumn } from "lucide-react";
import { z } from "zod";
import { createPublicDetailClient as createClient } from "@/lib/supabase/public-detail";
import { appraisalRatio } from "@/lib/utils/money";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PriceAmount } from "./price-amount";
import { PriceAttractivenessDetails } from "./price-attractiveness-details";
import { DetailPreviewHeader } from "./detail-preview-header";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { NaverMapPreview } from "@/components/naver-map-preview";
import { RealComparison } from "./real-comparison";
import type { Property } from "@/types/property";

const photoSchema=z.object({id:z.string(),path:z.string(),width:z.number(),height:z.number()});
const targetSchema=z.object({target:z.object({complex:z.string().optional(),floor:z.number().optional(),auctionDate:z.string().nullish()})});
const comparisonSummarySchema=z.object({status:z.literal("matched"),coverage:z.object({complete:z.literal(true)}),trades:z.array(z.object({date:z.string(),price:z.string().regex(/^\d+$/)})).min(1)});
type History={id:string;checked_at:string;minimum_bid_price:string|null;appraisal_price:string|null;failed_bid_count:number|null;status:string|null};
const dateLabel=(value:string)=>{
 const parts=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(value));
 return ["year","month","day"].map(type=>parts.find(part=>part.type===type)?.value).join(".")+".";
};

async function coordinates(p:Property){
 return locateAddress(p);
}

// Approved detail layout for Seoul/Gyeonggi court properties.
export async function CourtDetailPreview({property:p,history}:{property:Property;history:History[]}){
 const client=await createClient();
 const [photoResult,comparisonResult,position]=await Promise.all([
  client.from("property_media").select("id,path,width,height").eq("property_id",p.id).order("sort_order").order("id"),
  client.from("property_comparisons").select("*").eq("property_id",p.id).maybeSingle(),
  coordinates(p),
 ]);
 const photos=photoResult.error?[]:z.array(photoSchema).parse(photoResult.data);
 const target=targetSchema.safeParse(comparisonResult.data);
 const title=target.success?target.data.target.complex||p.title:p.title;
 const auctionDate=target.success?target.data.target.auctionDate:null;
 const floor=target.success?target.data.target.floor:null;
 const comparison=comparisonSummarySchema.safeParse(comparisonResult.error?null:comparisonResult.data);
 const latest=comparison.success?comparison.data.trades[0]:null;
 const minimum=Number(p.minimum_bid_price),latestPrice=Number(latest?.price);
 const priceGap=latest&&Number.isSafeInteger(minimum)&&minimum>0&&Number.isSafeInteger(latestPrice)&&latestPrice>0?(minimum/latestPrice-1)*100:null;
 const status=p.lifecycle_state==="closed"?(p.lifecycle_reason?.startsWith("취하")?"취하":p.lifecycle_reason?.startsWith("취소")?"취소":p.lifecycle_reason?.startsWith("매각")?"매각 · 대금납부 미확인":"해당 입찰 종료"):p.lifecycle_state==="needs-recheck"?"진행 여부 재확인 필요":p.status||"진행상태 확인 필요";
 const facts=[
  {label:"소재지",value:p.address||"확인 필요"},
  {label:"사건번호",value:p.source_property_id.replace(/^.*?:/,"")},
  {label:"관할 법원",value:p.source_property_id.split(":")[0]},
  {label:"물건번호",value:p.auction_condition_id},
  {label:"용도 · 처분",value:`${p.usage_type||"부동산"} · ${p.disposal_method||"법원경매"}`},
  {label:"전용면적",value:p.exclusive_area!==null?`${p.exclusive_area}㎡`:"확인 필요"},
  {label:"해당 층",value:floor!==undefined&&floor!==null?`${floor}층`:"확인 필요"},
  ...(p.land_area!==null?[{label:"토지면적",value:`${p.land_area}㎡`}]:[]),
  ...(p.building_area!==null?[{label:"건물면적",value:`${p.building_area}㎡`}]:[]),
 ];
 const changes=history.filter((row,index)=>{
  const previous=history[index+1];
  return !previous||["minimum_bid_price","appraisal_price","failed_bid_count","status"].some(key=>row[key as keyof History]!==previous[key as keyof History]);
 });
 const mapUrl=`https://map.naver.com/p/search/${encodeURIComponent(p.address||title)}`;
 return <div className="-mt-5 space-y-5 md:-mt-6">
  <div className="flex items-center justify-between"><Button asChild variant="ghost" size="sm" className="-ml-3"><Link href="/properties?demo=0"><ArrowLeft className="size-4"/>물건 목록</Link></Button><span className="text-xs text-muted-foreground">법원경매 · 물건 {p.auction_condition_id}</span></div>
  <div className="flex flex-wrap items-center gap-2">
   {priceGap!==null&&priceGap>0&&<Badge variant="outline" className="gap-1.5 border-rausch/20 bg-rausch/10 text-rausch-600"><TriangleAlert/>가격 비교 주의</Badge>}
   <PriceAttractivenessDetails badge/>
  </div>
  <DetailPreviewHeader photo={photos[0]?.path} title={title}>
   <div className="mb-1.5 flex min-w-0 items-center gap-1.5 md:flex-wrap md:gap-2"><Badge variant="outline" className="shrink-0 rounded-full bg-white text-[10px] md:text-xs">{p.usage_type}</Badge><span className="min-w-0 truncate text-[10px] text-muted-foreground md:whitespace-normal md:text-xs" title={`${p.source_property_id.replace(":"," ")} · 물건 ${p.auction_condition_id}`}>{p.source_property_id.replace(":"," ")} · 물건 {p.auction_condition_id}</span></div><h1 className="truncate text-xl leading-tight md:whitespace-normal md:text-[28px]" title={title}>{title}</h1>
    <div className="mt-1.5 space-y-1 md:mt-2"><p className="flex items-start gap-1.5 text-xs leading-normal text-muted-foreground md:text-sm"><MapPin className="mt-0.5 size-3 shrink-0 md:size-3.5"/><span className="min-w-0 line-clamp-2 md:line-clamp-none" title={p.address??undefined}>{p.address}</span></p><p className="truncate text-right text-[10px] text-muted-foreground md:whitespace-normal md:text-[11px]" data-detail-updated title={`최신 업데이트:${dateLabel(p.last_seen_at)}`}>최신 업데이트:{dateLabel(p.last_seen_at)}</p></div>
  </DetailPreviewHeader>
  <Card className="gap-0 border-0 py-3 shadow-none"><CardContent className="flex flex-wrap items-center justify-between gap-3 px-5"><span className="flex items-center gap-2 text-sm font-medium"><ChartNoAxesColumn className="size-4 text-muted-foreground"/>가격 매력도</span><div className="flex items-center gap-2"><Badge variant="secondary">점수 산정 전</Badge><PriceAttractivenessDetails/></div></CardContent></Card>
  <Card className="gap-0 overflow-hidden border-0 py-0 shadow-none">
   <CardContent className="p-0"><div className="grid md:grid-cols-2 xl:grid-cols-[1.2fr_1.2fr_1fr_1.5fr] [&>div]:border-border [&>div+div]:border-t md:[&>div+div]:border-t-0 md:[&>div:nth-child(even)]:border-l md:[&>div:nth-child(n+3)]:border-t xl:[&>div:nth-child(n+3)]:border-t-0 xl:[&>div+div]:border-l">
    <div className="px-5 py-5"><Badge className="border-rausch/15 bg-rausch/10 text-rausch-600">현재 최저입찰가</Badge><div className="mt-2"><PriceAmount value={p.minimum_bid_price} className="text-[26px] font-bold leading-tight text-rausch"/></div></div>
    <div className="px-5 py-5"><p className="text-sm text-muted-foreground">감정평가금액</p><div className="mt-2"><PriceAmount value={p.appraisal_price} className="text-2xl"/></div></div>
    <div className="px-5 py-5"><p className="text-sm text-muted-foreground">감정가 대비 최저가율</p><p className="mt-2 text-2xl font-semibold">{appraisalRatio(p.minimum_bid_price,p.appraisal_price)||"미산정"}</p></div>
    <div className="px-5 py-5">
     <p className="text-sm text-muted-foreground">최신 실거래가 대비 최저입찰가</p>
     <div className="mt-2">
      <p className={`text-2xl font-semibold ${priceGap!==null&&priceGap>0?"text-rausch":""}`}>{priceGap===null?"미산정":priceGap===0?"동일":`${Math.abs(priceGap).toFixed(1)}% ${priceGap>0?"높음":"낮음"}`}</p>
     </div>
     {priceGap!==null&&latest&&<div className="mt-1 space-y-1 text-xs leading-4 text-muted-foreground">
      <p>실거래보다 <span className="font-bold text-foreground"><PriceAmount value={String(Math.abs(minimum-latestPrice))}/></span> <span className={priceGap>0?"font-medium text-rausch":"font-medium text-foreground"}>{priceGap>0?"비쌈":priceGap<0?"저렴":"동일"}</span></p>
      <p>최신실거래 <span className="font-bold text-foreground"><PriceAmount value={latest.price}/></span> <time dateTime={latest.date}>({latest.date.replaceAll("-", ".")})</time></p>
     </div>}
    </div>
   </div><div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-t px-5 py-3"><span className="flex items-center gap-2"><Gavel className="size-4"/><strong>{status}</strong></span><span><span className="text-muted-foreground">유찰 </span><strong>{p.failed_bid_count??"미확인"}{p.failed_bid_count!==null?"회":""}</strong></span><span><span className="text-muted-foreground">매각기일 </span><strong>{auctionDate||"확인 필요"}</strong></span><Button asChild variant="outline" size="sm" className="ml-auto h-8"><a href="https://www.courtauction.go.kr/" target="_blank" rel="noreferrer">법원 원문 확인<ArrowUpRight className="size-3.5"/></a></Button></div></CardContent>
  </Card>
  <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(290px,1fr)]">
   <div className="min-w-0 space-y-5"><RealComparison id={p.id} minimum={p.minimum_bid_price} snapshot={comparisonResult.error?undefined:comparisonResult.data} compact/>
    <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="space-y-3 px-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">위치</h2><Button asChild variant="outline" className="min-h-[44px]"><a href={mapUrl} target="_blank" rel="noreferrer">네이버 지도로 이동<ArrowUpRight className="size-5"/></a></Button></div>{position?<NaverMapPreview {...position} title={title} compact/>:<div className="flex aspect-[4/3] flex-col md:aspect-video items-center justify-center gap-3 rounded-lg bg-muted px-5 text-center"><MapPin className="size-5 text-muted-foreground"/><p className="text-sm">{p.address}</p><a className="text-xs underline" href={mapUrl} target="_blank" rel="noreferrer">지도에서 위치 확인</a><p className="text-xs text-muted-foreground">주소 위치를 확인하지 못했습니다. 네이버지도에서 확인해 주세요.</p></div>}</CardContent></Card>
   </div>
   <div className="space-y-5">

    <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="px-5"><h2 className="mb-4 text-lg font-semibold">물건 기본정보</h2><dl className="space-y-3">{facts.map(f=><div key={f.label} className="flex items-baseline justify-between gap-3 text-sm"><dt className="shrink-0 text-muted-foreground">{f.label}</dt><dd className="text-right font-medium">{f.value}</dd></div>)}</dl></CardContent></Card>
   </div>
  </div>
  <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="px-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">가격·입찰 변경이력</h2><span className="text-xs text-muted-foreground">확인된 가격과 입찰 조건의 변화</span></div><Table><TableHeader><TableRow><TableHead>기준일</TableHead><TableHead>최저입찰가</TableHead><TableHead>감정가</TableHead><TableHead>유찰</TableHead><TableHead>진행상태</TableHead></TableRow></TableHeader><TableBody>{changes.map(h=><TableRow key={h.id}><TableCell className="whitespace-nowrap">{new Date(h.checked_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}</TableCell><TableCell className="whitespace-nowrap font-semibold"><PriceAmount value={h.minimum_bid_price}/></TableCell><TableCell className="whitespace-nowrap"><PriceAmount value={h.appraisal_price}/></TableCell><TableCell>{h.failed_bid_count===null?"—":`${h.failed_bid_count}회`}</TableCell><TableCell>{h.status||"확인 필요"}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
  {!!photos.length&&<section id="court-photos" className="scroll-mt-8 rounded-xl bg-white p-5"><div className="mb-3 flex items-center gap-3"><h2 className="text-lg font-semibold">물건 사진</h2><span className="text-xs text-muted-foreground">{photos.length}장</span></div><div className="flex flex-wrap gap-3">{photos.map((m,i)=><a key={m.id} href={m.path} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg bg-muted" aria-label={`법원 사진 ${i+1} 크게 보기`}><Image unoptimized={m.path.startsWith("/media/court/") && m.path.endsWith(".webp")} src={m.path} alt={`${title} 법원 사진 ${i+1}`} width={120} height={90} sizes="120px" className="h-[90px] w-[120px] object-contain"/></a>)}</div><p className="mt-3 text-xs text-muted-foreground"><a href="https://www.courtauction.go.kr/" target="_blank" rel="noreferrer">사진: 법원경매정보 참고</a></p></section>}
 </div>;
}
