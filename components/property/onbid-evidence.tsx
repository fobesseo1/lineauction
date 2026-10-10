import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";

export function officialOnbidUrl(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && ["www.onbid.co.kr", "onbid.co.kr", "open.kamco.or.kr"].includes(u.hostname) && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

// Shape returned by the public.onbid_public_detail RPC (whitelisted display fields only).
export const onbidDetailSchema = z.object({
  detail_status: z.string().nullish(),
  fields: z.record(z.string(), z.string()).default({}),
  photos: z.array(z.object({ url: z.string().nullish(), kind: z.string().nullish() })).default([]),
  documents: z.array(z.object({ title: z.string().nullish(), url: z.string().nullish() })).default([]),
});
export type OnbidDetail = z.infer<typeof onbidDetailSchema>;

const LABELS: Array<[string, string]> = [
  ["orgNm", "공고기관"], ["evcRsbyTrgtCont", "인도·인수 책임"], ["cptnMthodNm", "입찰방식"], ["bidMthodNm", "세부입찰방식"],
  ["cltrRadr", "도로명주소"], ["utlzPscdCont", "이용현황"], ["icdlCdtnCont", "부대조건"], ["pytnMtrsCont", "유의사항"],
  ["dsplVldCont", "매각 후 유지되는 권리"], ["cltrEtcCont", "기타정보"],
];

export function OnbidEvidence({ detail }: { detail: OnbidDetail | null }) {
  if (!detail) return <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="px-5"><h2 className="text-lg font-semibold">온비드 공식 자료</h2><p className="mt-3 text-sm text-muted-foreground">온비드 추가 자료를 확인 중입니다.</p></CardContent></Card>;
  const details = LABELS.map(([key, label]) => [label, detail.fields[key]?.trim()] as const).filter(([, value]) => value);
  const docs = detail.documents.map(d => ({ title: d.title, url: officialOnbidUrl(d.url) })).filter(d => d.url);
  return <Card className="gap-0 border-0 py-5 shadow-none"><CardContent className="space-y-5 px-5">
    <h2 className="text-lg font-semibold">온비드 공식 자료</h2>
    {details.length ? <dl className="grid gap-5 sm:grid-cols-2">{details.map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{value}</dd></div>)}</dl> : <p className="text-sm text-muted-foreground">표시할 공고 세부 항목이 없습니다.</p>}
    <div className="border-t pt-4">
      <h3 className="font-semibold">감정평가서·공고·관련 문서</h3>
      {docs.length ? docs.map((d, i) => <a className="mt-2 block text-sm underline" href={d.url!} target="_blank" rel="noreferrer" key={d.url}>{d.title || `공식 문서 ${i + 1}`}</a>)
        : <p className="mt-2 text-sm text-muted-foreground">{detail.detail_status === "completed" ? "온비드가 제공한 공식 문서 링크가 없습니다." : "상세 자료를 순서대로 수집하고 있습니다. 온비드 상세 조회는 하루 1,000건 한도라 며칠에 걸쳐 채워집니다."}</p>}
    </div>
  </CardContent></Card>;
}
