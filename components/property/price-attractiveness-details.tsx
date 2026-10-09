"use client";

import { ChartNoAxesColumn, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

export function PriceAttractivenessDetails({ badge = false }: { badge?: boolean }) {
  return <Dialog>
    <DialogTrigger asChild>
      {badge ? <button type="button" aria-label="가격 매력도 설명 열기" className="rounded-full focus-visible:outline-2 focus-visible:outline-ring"><Badge variant="outline" className="gap-1.5 bg-white hover:bg-muted"><ChartNoAxesColumn/>가격 매력도 · 산정 전<ChevronRight/></Badge></button> : <Button variant="ghost" size="sm" className="h-8" aria-label="가격 매력도 자세히 보기">자세히 보기<ChevronRight className="size-3.5"/></Button>}
    </DialogTrigger>
    <DialogContent className="bg-white">
      <DialogTitle>가격 매력도 자세히 보기</DialogTitle>
      <DialogDescription>점수와 등급은 아직 산정되지 않았습니다. 현재 화면의 가격 차이는 최신 비교 거래와 최저입찰가를 단순 비교한 값입니다.</DialogDescription>
      <div className="space-y-3 rounded-lg bg-muted p-4 text-sm leading-6">
        <p className="font-medium">평가 기준이 확정되면 이곳에서 확인하실 수 있습니다.</p>
        <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
          <li>점수와 등급의 의미</li>
          <li>비교에 사용한 거래와 선정 근거</li>
          <li>항목별 평가와 가격에 영향을 준 조건</li>
        </ul>
      </div>
      <div className="flex justify-end"><DialogClose asChild><Button variant="outline">확인</Button></DialogClose></div>
    </DialogContent>
  </Dialog>;
}
