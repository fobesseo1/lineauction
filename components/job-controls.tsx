"use client";
import { useCallback, useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Run = { job: string; trigger: string; day: string; status: string; reason?: string; startedAt?: string; finishedAt?: string; at?: string; steps?: { name: string; code: number; seconds: number }[] };
type Health = { checkedAt: string; ok: boolean; problems: { key: string; title: string; message: string }[] };
type State = { current: Run | null; last: Record<"onbid" | "court", Run | null>; health: Health | null; recent: Run[] };
const JOBS = [
  { id: "onbid", label: "온비드 공매", schedule: "매일 오전 10시" },
  { id: "court", label: "법원 경매", schedule: "평일 오후 3시" },
] as const;
const statusLabel: Record<string, string> = { completed: "완료", failed: "실패", skipped: "건너뜀" };
const time = (value?: string) => (value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "—");

// Manual start and status for the scheduled daily jobs (local app only).
export function JobControls() {
  const [state, setState] = useState<State | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(() => fetch("/api/jobs", { cache: "no-store" }).then(r => (r.ok ? r.json() : null)).then(setState).catch(() => {}), []);
  useEffect(() => { void load(); const timer = setInterval(load, 10000); return () => clearInterval(timer); }, [load]);
  const start = async (job: string) => {
    setMessage(null);
    const response = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job }) }).catch(() => null);
    setMessage(response?.ok ? "실행을 요청했습니다. 시작·완료는 Windows 알림으로도 알려드립니다." : "실행 요청에 실패했습니다.");
    setTimeout(load, 1500);
  };
  return <Card className="border-0 shadow-none"><CardContent className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2>일일 자동 실행</h2>{state?.current && <Badge>{state.current.job === "onbid" ? "온비드" : "법원"} 실행 중 · {state.current.trigger === "manual" ? "수동" : "자동"}</Badge>}</div>
    <div className="grid gap-3 sm:grid-cols-2">{JOBS.map(job => {
      const last = state?.last[job.id];
      return <div key={job.id} className="space-y-3 rounded-xl bg-muted p-4">
        <div className="flex items-center justify-between gap-2"><p className="font-semibold">{job.label}</p><span className="text-xs text-muted-foreground">{job.schedule}</span></div>
        <p className="text-sm">최근 실행 {last ? `${statusLabel[last.status] ?? last.status} · ${last.trigger === "manual" ? "수동" : "자동"} · ${time(last.finishedAt ?? last.at)}` : "기록 없음"}</p>
        <Button size="sm" className="gap-1.5" disabled={!!state?.current} onClick={() => start(job.id)}><Play className="size-3.5" />지금 실행</Button>
      </div>;
    })}</div>
    {state?.health && <div className="space-y-1 text-sm"><p><span className="text-muted-foreground">감시 </span><strong className={state.health.ok ? "" : "text-rausch"}>{state.health.ok ? "정상" : "이상"}</strong><span className="text-xs text-muted-foreground"> · 10분마다 확인 · {time(state.health.checkedAt)}</span></p>{state.health.problems.map(p => <p key={p.key} className="text-rausch">{p.title}: {p.message}</p>)}</div>}
    {message && <p className="text-sm">{message}</p>}
    <p className="text-xs text-muted-foreground">PC가 꺼져 있어 정해진 시간을 놓치면 켜진 뒤 바로 실행합니다. 같은 날 수동으로 이미 실행했다면 자동 실행은 건너뛰고 알림만 보냅니다. 바탕화면 바로가기로도 실행할 수 있습니다.</p>
  </CardContent></Card>;
}
