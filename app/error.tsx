"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="rounded-xl bg-white px-6 py-16 text-center">
      <h1>데이터를 불러오지 못했습니다</h1>
      <p className="mt-3 text-muted-foreground">
        연결 상태를 확인한 후 다시 시도해 주세요.
      </p>
      <Button onClick={reset} className="mt-6 rounded-full">
        다시 시도
      </Button>
    </div>
  );
}
