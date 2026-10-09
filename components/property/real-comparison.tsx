import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatWon } from "@/lib/utils/money";
import { PriceAmount } from "./price-amount";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
const schema = z.object({
  status:z.string(),reason:z.string(),rule_version:z.string(),source_url:z.url(),observed_at:z.string(),
  coverage:z.object({months:z.array(z.object({month:z.string()})).optional(),complete:z.boolean().optional()}),
  target:z.object({complex:z.string().optional(),area:z.number().optional(),floor:z.number().optional(),court:z.string().optional(),caseNumber:z.string().optional(),auctionDate:z.string().nullish()}),
  trades:z.array(z.object({id:z.string(),date:z.string(),price:z.string(),area:z.number(),floor:z.number(),building:z.string().nullable(),method:z.string().nullable(),areaDelta:z.number(),floorDelta:z.number().nullable()}))
});
export async function RealComparison({id,minimum,snapshot,compact=false}:{id:string;minimum:string|null;snapshot?:unknown;compact?:boolean}) {
 const {data,error}=snapshot===undefined?await (await createClient()).from("property_comparisons").select("*").eq("property_id",id).maybeSingle():{data:snapshot,error:null};
 const parsed=schema.safeParse(data);
 if(error||!parsed.success)return <Card><CardContent><h2>실거래 비교</h2><p className="mt-3 text-muted-foreground">{error?"비교 자료를 불러오지 못했습니다. 다시 확인해 주세요.":"아직 비교 자료가 수집되지 않았습니다."}</p></CardContent></Card>;
 const c=parsed.data;const latest=c.trades[0];
 const gap=minimum&&latest&&Number(latest.price)>0?(1-Number(minimum)/Number(latest.price))*100:null;
 return <Card className={compact?"gap-0 border-0 py-5 shadow-none":"border-0 shadow-none"}><CardContent className={compact?"space-y-4 px-5":"space-y-5"}>
  <div className="flex flex-wrap items-center justify-between gap-3"><h2>국토교통부 실거래 비교</h2><Badge variant="outline">{c.status==='matched'?`${c.trades.length}건 연결`:c.status==='no-trades'?"조건 일치 거래 없음":"매칭 대기"}</Badge></div>
  <p className={compact?"text-xs leading-5 text-muted-foreground":"text-muted-foreground"}>{compact&&latest?"같은 단지·법정동·지번 / 전용면적 ±0.1㎡ / 해제 거래 제외":c.reason}</p>
  {!compact&&c.target.auctionDate&&<p className="text-sm">매각기일 {c.target.auctionDate} · {c.target.court} {c.target.caseNumber}</p>}
  {latest&&<>
   <p className="text-sm">{c.target.complex} · 대상 전용 {c.target.area}㎡ · {c.target.floor}층</p>
   <div className={`grid gap-4 rounded-lg bg-muted p-4 ${compact?"md:grid-cols-2":"md:grid-cols-3"}`}>
    <div><p className="text-sm text-muted-foreground">최저입찰가</p><div className="mt-2 text-xl font-semibold">{compact?<PriceAmount value={minimum}/>:formatWon(minimum)}</div></div>
    <div><p className="text-sm text-muted-foreground">최신 비교 거래 · {latest.date}</p><div className="mt-2 text-xl font-semibold">{compact?<PriceAmount value={latest.price}/>:formatWon(latest.price)}</div></div>
    {!compact&&<div><p className="text-xs text-muted-foreground">최신 거래가 대비 최저입찰가</p><p className="mt-2 text-xl font-semibold">{gap===null?"미산정":gap===0?"동일":`${Math.abs(gap).toFixed(1)}% ${gap>0?"낮음":"높음"}`}</p></div>}
   </div>
   <Table><TableHeader><TableRow><TableHead>계약일</TableHead><TableHead>전용면적</TableHead><TableHead>동 / 층</TableHead><TableHead>대상과 차이</TableHead><TableHead className="text-right">실제 거래가</TableHead></TableRow></TableHeader><TableBody>
    {c.trades.map(t=><TableRow key={t.id}><TableCell>{t.date}</TableCell><TableCell>{t.area}㎡</TableCell><TableCell>{t.building||"동 미공개"} / {t.floor}층</TableCell><TableCell>면적 {t.areaDelta.toFixed(4)}㎡ · 층 {t.floorDelta??"미확인"}</TableCell><TableCell className="text-right">{compact?<PriceAmount value={t.price}/>:formatWon(t.price)}</TableCell></TableRow>)}
   </TableBody></Table>
   <p className="text-sm text-muted-foreground">과거 계약가와 현재 최저입찰가의 단순 비교입니다. 내부 상태·임차관계·권리와 추가 비용은 반영하지 않았습니다. 매각 일정과 조건은 법원 원문에서 재확인하세요.</p>
  </>}
  <p className="text-xs text-muted-foreground">{compact?"거래 조회":"조회 월"} {c.coverage.months?.map(m=>compact?`${m.month.slice(0,4)}.${m.month.slice(4)}`:m.month).join(", ")||"미조회"} · {compact?"기준":"마지막 확인"} {new Date(c.observed_at).toLocaleDateString("ko-KR",{timeZone:"Asia/Seoul"})}{!compact&&` · 규칙 ${c.rule_version}`}</p>
  <div className="flex flex-wrap gap-5 text-sm underline"><a href={c.source_url} target="_blank" rel="noreferrer">국토교통부 실거래가 공개시스템</a><a href="https://www.courtauction.go.kr/" target="_blank" rel="noreferrer">대한민국 법원경매정보 · 사건번호로 확인</a></div>
 </CardContent></Card>;
}
