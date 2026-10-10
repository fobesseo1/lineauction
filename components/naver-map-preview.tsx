"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type MapInstance = { destroy(): void };
type MarkerInstance = { setMap(map: null): void };
type MapsSDK = {
  LatLng: new (latitude: number, longitude: number) => object;
  Map: new (element: HTMLElement, options: object) => MapInstance;
  Marker: new (options: object) => MarkerInstance;
};
type MapWindow = Window & {
  naver?: { maps: MapsSDK };
  navermap_authFailure?: () => void;
};

// Real address verified through NAVER Geocoding; this is a connection sample,
// not a demo auction property or a matched comparable transaction.
export function NaverMapPreview({latitude=37.4838652,longitude=127.0808739,title="푸른마을아파트 · 연결 확인용 위치",compact=false}:{latitude?:number;longitude?:number;title?:string;compact?:boolean}={}) {
  const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID?.trim();
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const target = window as MapWindow;
    const previous = target.navermap_authFailure;
    const authFailure = () => setError("지도 인증에 실패했습니다. 네이버 Maps의 Dynamic Map 선택과 Web 서비스 URL 등록을 확인해 주세요.");
    target.navermap_authFailure = authFailure;
    return () => {
      if (target.navermap_authFailure === authFailure)
        target.navermap_authFailure = previous;
    };
  }, []);

  useEffect(() => {
    if (!clientId || ready || error) return;
    const timeout = setTimeout(() => setError("지도를 불러오지 못했습니다. 네트워크와 Maps 설정을 확인한 후 새로고침해 주세요."), 20000);
    return () => clearTimeout(timeout);
  }, [clientId, ready, error]);

  useEffect(() => {
    const maps = (window as MapWindow).naver?.maps;
    if (!ready || !maps || !container.current) return;
    const position = new maps.LatLng(latitude, longitude);
    const map = new maps.Map(container.current, {
      center: position, zoom: 16, zoomControl: true, scrollWheel: false,
    });
    const marker = new maps.Marker({ position, map, title });
    return () => { marker.setMap(null); map.destroy(); };
  }, [ready,latitude,longitude,title]);

  return (
    <div className="space-y-3">
      {!compact&&<p className="text-sm text-muted-foreground">
        연결 확인용 위치: 서울 강남구 일원동 719 푸른마을아파트. 실제 지도이며 공매 물건과 실거래 매칭은 아직 적용 전입니다.
      </p>}
      <div className="relative overflow-hidden rounded-xl border bg-muted">
        <div ref={container} className="aspect-[4/3] w-full md:aspect-video" aria-label={`${title} 네이버지도`} />
        {(!clientId || error || !ready) && (
          <p role="status" className="absolute inset-0 grid place-content-center bg-white/95 px-6 text-center text-sm">
            {!clientId ? "네이버 Maps Client ID 설정이 필요합니다." : error || "네이버지도를 불러오는 중입니다…"}
          </p>
        )}
      </div>
      {clientId && (
        <Script
          id="naver-maps-sdk"
          src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder`}
          strategy="afterInteractive"
          onReady={() => {
            if ((window as MapWindow).naver?.maps) setReady(true);
            else setError("지도 SDK를 초기화하지 못했습니다. Maps 인증 정보를 확인해 주세요.");
          }}
          onError={() => setError("지도 SDK를 불러오지 못했습니다. 네트워크 연결을 확인해 주세요.")}
        />
      )}
    </div>
  );
}
