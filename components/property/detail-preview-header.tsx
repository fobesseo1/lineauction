"use client";

import Image from "next/image";
import { isPreparedCourtPhoto } from "@/lib/court-media";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function DetailPreviewHeader({ photo, title, children, photosHref = "#court-photos", photosLabel = "법원 사진 모아보기" }: { photo?: string; title: string; children: ReactNode; photosHref?: string; photosLabel?: string }) {
  const text = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(96);
  useEffect(() => {
    const element = text.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setHeight(Math.ceil(entry.contentRect.height)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <header className="flex items-start gap-3 md:gap-4" style={{ "--preview-header-height": `${height}px` } as React.CSSProperties}>
    {photo && <a href={photosHref} aria-label={photosLabel} className="relative size-[var(--preview-header-height)] shrink-0 overflow-hidden rounded-lg">
      <Image unoptimized={isPreparedCourtPhoto(photo) || /^https?:/.test(photo)} src={photo} alt={`${title} 대표 사진`} fill sizes="128px" className="object-cover"/>
    </a>}
    <div ref={text} className="min-w-0 flex-1">{children}</div>
  </header>;
}
