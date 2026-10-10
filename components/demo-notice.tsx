import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export function DemoNotice({ active }: { active: boolean }) {
  // Real-data pages show no banner; the demo is reached from the 데모 menu.
  if (!active) return null;
  return (
    <aside
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bebe bg-white px-5 py-4"
      aria-label="데모 모드 안내"
    >
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="shrink-0 gap-1.5 rounded-full">
          <Sparkles className="size-3" />
          {active ? "데모 모드" : "실제 수집 자료"}
        </Badge>
        <p className="text-xs leading-5 text-muted-foreground">
          {active
            ? "가상 물건·가격·급매점수와 AI 이미지로 구성한 디자인 미리보기입니다."
            : "공식 출처와 확인시각, 비교에 사용한 거래를 함께 확인하세요."}
        </p>
      </div>
      <Button asChild variant="ghost" size="sm" className="rounded-full">
        <Link href={active ? "/dashboard?demo=0" : "/dashboard?demo=1"}>
          {active ? "실제 데이터 화면" : "데모 보기"}
          <ArrowRight className="size-3.5" />
        </Link>
      </Button>
    </aside>
  );
}
