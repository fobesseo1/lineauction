import Image from "next/image";
import { z } from "zod";
import { createPublicDetailClient as createClient } from "@/lib/supabase/public-detail";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Property } from "@/types/property";

const mediaSchema=z.object({id:z.string(),path:z.string(),source_url:z.url(),observed_at:z.string(),width:z.number(),height:z.number()});
const eventSchema=z.object({id:z.string(),state:z.string(),reason:z.string(),checked_at:z.string()});
const labels:Record<string,string>={observed:"목록 관측", "needs-recheck":"재확인 필요", "needs-review":"자료 검수 필요",closed:"종료 확인"};
export async function CourtEvidence({property:p}:{property:Property}){
 const client=await createClient();
 const [photos,events]=await Promise.all([
  client.from("property_media").select("id,path,source_url,observed_at,width,height").eq("property_id",p.id).order("sort_order").order("id"),
  client.from("property_lifecycle_history").select("id,state,reason,checked_at").eq("property_id",p.id).order("checked_at",{ascending:false}).limit(10),
 ]);
 if(photos.error||events.error)throw Error("Court evidence query failed");
 const media=z.array(mediaSchema).parse(photos.data),history=z.array(eventSchema).parse(events.data);
 return <div className="space-y-6">
  {p.lifecycle_state&&<Card className="border-0 shadow-none"><CardContent className="space-y-3">
   <Badge variant={p.lifecycle_state==="closed"?"secondary":"outline"}>{labels[p.lifecycle_state]}</Badge>
   <p>{p.lifecycle_reason}</p><p className="text-xs text-muted-foreground">확인: {p.lifecycle_checked_at?new Date(p.lifecycle_checked_at).toLocaleString("ko-KR",{timeZone:"Asia/Seoul"}):"—"}</p>
   {history.length>1&&<details><summary className="cursor-pointer text-sm">상태 변경 이력</summary><ul className="mt-3 space-y-2 text-sm">{history.map(e=><li key={e.id}>{new Date(e.checked_at).toLocaleDateString("ko-KR")} · {labels[e.state]??e.state} · {e.reason}</li>)}</ul></details>}
  </CardContent></Card>}
  {!!media.length&&<section className="space-y-4"><h2>법원 공개 사진</h2><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{media.map((m,i)=><figure key={m.id} className="overflow-hidden rounded-xl bg-white"><Image unoptimized={m.path.startsWith("/media/court/") && m.path.endsWith(".webp")} src={m.path} alt={`${p.title} 법원 공개 사진 ${i+1}`} width={m.width} height={m.height} sizes="(max-width:640px) 100vw, 33vw" className="aspect-[4/3] w-full object-contain"/><figcaption className="p-3 text-xs text-muted-foreground"><a href={m.source_url} target="_blank" rel="noreferrer" className="underline">출처: 대한민국 법원 법원경매정보</a><p>수집 {new Date(m.observed_at).toLocaleDateString("ko-KR")} · 용량을 줄인 사진</p></figcaption></figure>)}</div><p className="text-xs text-muted-foreground">사진 촬영일과 현재 현황은 다를 수 있습니다. 사건 {p.source_property_id} · 물건 {p.auction_condition_id}</p></section>}
 </div>;
}
