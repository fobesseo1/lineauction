import Link from "next/link";
import { Database, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export function CollectionState({
  state,
}: {
  state: "ready" | "unconfigured" | "error";
}) {
  const text = {
    ready: [
      "아직 수집된 물건이 없습니다",
      "온비드 수집을 실행하면 이곳에서 공매물건과 가격 변화를 확인할 수 있습니다.",
    ],
    unconfigured: [
      "공매 리서치를 시작할 준비",
      "Supabase와 온비드 연결 설정을 완료하면 수집한 물건이 표시됩니다.",
    ],
    error: [
      "수집 데이터를 불러오지 못했습니다",
      "Supabase 연결과 DB 마이그레이션 적용 상태를 확인해 주세요.",
    ],
  }[state];
  return (
    <Card className="rounded-xl border-0 py-0 shadow-none">
      <CardContent className="flex flex-col items-center px-6 py-14 text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-full bg-faint">
          <Database className="size-6" />
        </div>
        <h3 className="text-xl font-medium">{text[0]}</h3>
        <p className="mt-3 max-w-md leading-6 text-muted-foreground">
          {text[1]}
        </p>
        <Button asChild className="mt-6 rounded-full px-6">
          <Link href="/settings">
            연결 설정 보기
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
