"use client";
import { useState } from "react";
import Image from "next/image";
import { isPreparedCourtPhoto } from "@/lib/court-media";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import dynamic from 'next/dynamic';
const CoverLocationMap=dynamic(()=>import('./cover-location-map').then(m=>m.CoverLocationMap),{ssr:false});

export function PropertyCover({ src, title, source, address='',region='',href,visible=false }: { src?: string | null; title: string; source: "court" | "onbid";address?:string;region?:string;href:string;visible?:boolean }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const available = !!src && failedSource !== src;
  const mapQuery=address||region;
  if(!available&&mapQuery)return <a href={`https://map.naver.com/p/search/${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer" aria-label={`${title} 네이버지도에서 위치 보기`} className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
    {visible?<CoverLocationMap address={mapQuery} approximate={!address}/>:<span className="absolute inset-0 grid place-content-center text-sm">위치 지도</span>}
  </a>;
  return <Link href={href} prefetch={visible} className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
    {available ? <Image src={src} alt={`${title} ${source === "court" ? "법원 공개 사진" : "온비드 대표 사진"}`} fill
      unoptimized={source === "onbid" || isPreparedCourtPhoto(src)} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw"
      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={() => setFailedSource(src)} /> :
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400"><ImageOff className="size-9" strokeWidth={1.25}/><span className="text-sm">{src ? source === "onbid" ? "온비드 공식 사진을 불러오지 못했습니다" : "사진을 불러오지 못했습니다" : "대표 사진 미제공"}</span></div>}
    {available && <Badge className="absolute bottom-3 right-3 rounded-full bg-white/95 text-foreground">{source === "court" ? "법원 공개 사진" : "온비드 대표 사진"}</Badge>}
  </Link>;
}
