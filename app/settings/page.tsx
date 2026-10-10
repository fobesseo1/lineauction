import { Check, Circle, ArrowUpRight } from "lucide-react";
import { hasSupabaseConfig } from "@/lib/env/public";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { NaverMapPreview } from "@/components/naver-map-preview";
import { CourtMonitor } from "@/components/court-monitor";
import { OnbidMonitor } from "@/components/onbid-monitor";
import { JobControls } from "@/components/job-controls";
export const dynamic = "force-dynamic";
export default function Settings() {
  const configured = hasSupabaseConfig();
  return (
    <div className="max-w-4xl space-y-10">
      <section>
        <p className="mb-2 text-xs text-muted-foreground">
          WORKSPACE SETTINGS
        </p>
        <h1>연결과 수집 설정</h1>
        <p className="mt-2 text-muted-foreground">
          데이터 연결을 준비하고 리서치 환경을 확인하세요.
        </p>
        <Button asChild className="mt-5 rounded-full">
          <Link href="/dashboard?demo=1">가상 데이터로 디자인 둘러보기</Link>
        </Button>
      </section>
      <JobControls />
      <CourtMonitor />
      <OnbidMonitor />
      <Card className="border-0 shadow-none">
        <CardContent className="space-y-5">
          <h2>네이버 지도 연결 확인</h2>
          <NaverMapPreview />
        </CardContent>
      </Card>
      <Card className="border-0 shadow-none">
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2>데이터 연결</h2>
            <Badge variant="secondary" className="rounded-full">
              개인용 초기 버전
            </Badge>
          </div>
          {[
            {
              label: "Supabase",
              note: configured
                ? "환경변수 입력됨 · 실제 연결은 대시보드에서 확인"
                : "프로젝트 URL과 공개 키 설정 필요",
              done: configured,
            },
            {
              label: "온비드 Open API",
              note: "공공데이터포털에서 차세대 부동산 목록 API 활용신청 후 서버 키 설정",
              done: !!process.env.ONBID_API_KEY,
            },
            {
              label: "수집 작업 인증",
              note: "자동수집 요청을 인증할 비밀키 설정",
              done: !!process.env.CRON_SECRET,
            },
          ].map((s) => (
            <div key={s.label} className="flex items-start gap-3 border-t pt-5">
              {s.done ? (
                <Check className="mt-1 size-4 shrink-0" />
              ) : (
                <Circle className="mt-1 size-4 shrink-0 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">{s.label}</p>
                <p className="mt-1 text-muted-foreground">{s.note}</p>
              </div>
            </div>
          ))}
          <Button asChild variant="outline" className="rounded-lg">
            <a
              href="https://www.data.go.kr/data/15157207/openapi.do"
              target="_blank"
              rel="noreferrer"
            >
              온비드 공식 API 안내
              <ArrowUpRight className="size-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
      <Card className="border-0 shadow-none">
        <CardContent>
          <h2>시작 순서</h2>
          <ol className="mt-6 space-y-5 text-muted-foreground">
            <li>
              <span className="mr-3 text-foreground">01</span>README에 따라
              환경변수를 설정합니다.
            </li>
            <li>
              <span className="mr-3 text-foreground">02</span>Supabase에 초기 DB
              마이그레이션과 기본 설정을 적용합니다.
            </li>
            <li>
              <span className="mr-3 text-foreground">03</span>인증된 온비드
              수집을 실행하고 대시보드에서 결과를 확인합니다.
            </li>
          </ol>
        </CardContent>
      </Card>
      <section>
        <h2>다음 연결 단계</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {["국토부 실거래가", "급매점수 분석", "Telegram 알림"].map((s) => (
            <div key={s} className="rounded-xl bg-white p-5">
              <p className="font-medium">{s}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                후속 구현 예정
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
