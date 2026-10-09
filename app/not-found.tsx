import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <div className="rounded-xl bg-white px-6 py-16 text-center">
      <h1>물건을 찾을 수 없습니다</h1>
      <p className="mt-3 text-muted-foreground">
        물건 주소 또는 데이터 연결 상태를 확인해 주세요.
      </p>
      <Button asChild className="mt-6 rounded-full">
        <Link href="/properties">공매목록 보기</Link>
      </Button>
    </div>
  );
}
