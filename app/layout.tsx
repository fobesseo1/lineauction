import type { Metadata } from "next";
import { SiteHeader } from "@/components/site-header";
import { Suspense } from "react";
import "./globals.css";
export const metadata: Metadata = {
  title: "선경매 · LINE AUCTION",
  description: "법원 경매·온비드 공매물건과 국토부 실거래 비교 대시보드",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="preload"
          href="/fonts/PretendardVariable.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-white focus:p-4"
        >
          본문으로 이동
        </a>
        <Suspense fallback={<div className="h-20 border-b bg-white" />}>
          <SiteHeader />
        </Suspense>
        <main
          id="main"
          className="mx-auto min-h-[calc(100vh-200px)] max-w-[1440px] px-5 py-10 md:px-10 md:py-12"
        >
          {children}
        </main>
        <footer className="border-t px-5 py-8 text-xs text-muted-foreground md:px-10">
          <div className="mx-auto flex max-w-[1360px] flex-wrap justify-between gap-3">
            <span>선경매 · LINE AUCTION</span>
            <span>
              법원경매정보 · 온비드 · 국토교통부 실거래 · 데모: 가상 물건 / AI 이미지
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
