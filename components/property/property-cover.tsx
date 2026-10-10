"use client";
import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function PropertyCover({ src, title, source }: { src?: string | null; title: string; source: "court" | "onbid" }) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const available = !!src && failedSource !== src;
  return <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-slate-100">
    {available ? <Image src={src} alt={`${title} ${source === "court" ? "법원 공개 사진" : "온비드 대표 사진"}`} fill
      unoptimized={source === "onbid" || (src.startsWith("/media/court/") && src.endsWith(".webp"))} sizes="(max-width: 639px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw"
      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]" onError={() => setFailedSource(src)} /> :
      <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400"><ImageOff className="size-9" strokeWidth={1.25}/><span className="text-sm">{src ? "사진을 불러오지 못했습니다" : "대표 사진 미제공"}</span></div>}
    {available && <Badge className="absolute bottom-3 right-3 rounded-full bg-white/95 text-foreground">{source === "court" ? "법원 공개 사진" : "온비드 대표 사진"}</Badge>}
  </div>;
}
