"use client";
import Script from "next/script";
import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { NaverMapPreview } from "@/components/naver-map-preview";

type Position = { latitude: number; longitude: number };
type Geocoder = {
  Service?: {
    Status: { OK: unknown };
    geocode(options: { query: string }, callback: (status: unknown, response: { v2?: { addresses?: { x: string; y: string }[] } }) => void): void;
  };
};
const cache = new Map<string, Promise<Position | null>>();

// Geocodes in the browser with the public Naver Maps client ID, for addresses the server could
// not resolve (the public deployment has no server geocoding secret).
export function GeocodedMapPreview({ query, title, label, mapUrl }: { query: string; title: string; label: string; mapUrl: string }) {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim();
  const [position, setPosition] = useState<Position | null>(null);
  const [failed, setFailed] = useState(!clientId);
  useEffect(() => {
    if (!clientId) return;
    let active = true;
    const started = Date.now();
    const timer = setInterval(() => {
      const service = (window as Window & { naver?: { maps?: Geocoder } }).naver?.maps?.Service;
      if (!service) {
        if (Date.now() - started > 15000) { clearInterval(timer); if (active) setFailed(true); }
        return;
      }
      clearInterval(timer);
      if (!cache.has(query)) cache.set(query, new Promise(resolve => {
        const timeout = setTimeout(() => resolve(null), 8000);
        service.geocode({ query }, (status, response) => {
          clearTimeout(timeout);
          const row = response.v2?.addresses?.[0];
          const latitude = Number(row?.y), longitude = Number(row?.x);
          resolve(status === service.Status.OK && row && latitude >= 33 && latitude <= 39 && longitude >= 124 && longitude <= 132 ? { latitude, longitude } : null);
        });
      }));
      cache.get(query)!.then(found => { if (!active) return; if (found) setPosition(found); else setFailed(true); });
    }, 200);
    return () => { active = false; clearInterval(timer); };
  }, [clientId, query]);
  if (position) return <NaverMapPreview {...position} title={title} compact />;
  return <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-lg bg-muted px-5 text-center md:aspect-video">
    <MapPin className="size-5 text-muted-foreground" />
    <p className="text-sm">{label}</p>
    <a className="text-xs underline" href={mapUrl} target="_blank" rel="noreferrer">지도에서 위치 확인</a>
    <p className="text-xs text-muted-foreground">{failed ? "주소 위치를 확인하지 못했습니다. 네이버지도에서 확인해 주세요." : "위치를 찾는 중입니다…"}</p>
    {clientId && <Script id="naver-maps-sdk" src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder`} strategy="afterInteractive" onError={() => setFailed(true)} />}
  </div>;
}
