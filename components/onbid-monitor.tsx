"use client";
import {useEffect,useState} from 'react';
import {Card,CardContent} from '@/components/ui/card';
type Progress={status:string;updatedAt?:string;properties:number;conditions:number;pages:number;dbRows:number;requests:number;budget:number;serviceUsage:{list:number;detail:number};detailStatus:string;error?:string;detail:{processed:number;total:number;remaining:number;matchedConditions:number;missingConditions:number;photos:number;thumbnails:number;documents:number;withPhotos:number;withDocuments:number;dbRows:number;dbUpdatedAt:string|null;updatedAt:string|null};};
const labels:Record<string,string>={pending:'준비 중',running:'상세 수집 중',completed:'상세 API 처리 완료',failed:'오류 조사 필요',budget_wait:'오늘 한도 소진 · 다음 실행 때 이어받음',stopped:'STOP 중지',permission_required:'상세 API 승인 대기'};
export function OnbidMonitor(){
 const [p,setP]=useState<Progress|null>(null),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{let active=true;const load=()=>fetch('/api/onbid-progress',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject()).then(v=>{if(active){setP(v);setUnavailable(false);}}).catch(()=>{if(active)setUnavailable(true);});void load();const timer=setInterval(load,10000);return()=>{active=false;clearInterval(timer);};},[]);
 const num=(n:number|undefined)=>n===undefined?'—':n.toLocaleString('ko-KR');
 const tiles=(items:[string,number|undefined][])=> <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{items.map(([label,v])=><div className="rounded-xl bg-muted p-4" key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{num(v)}</p></div>)}</div>;
 const d=p?.detail;
 return <Card className="border-0 shadow-none"><CardContent className="space-y-5">
  <div className="flex justify-between gap-3"><h2>온비드 · 서울·경기 부동산 매각</h2><span className="text-sm">{p?.status==='list_completed'?'목록 완료':p?.status==='running'?'목록 수집 중':'목록 상태 확인 중'} · {labels[p?.detailStatus??'pending']??p?.detailStatus}</span></div>
  {tiles([['전체 중복 제거 물건',p?.properties],['공매조건별 자료',p?.conditions],['저장 목록 페이지',p?.pages],['목록 DB 처리 자료',p?.dbRows]])}
  <div className="space-y-2"><p className="text-sm">목록 조회 {p?.status==='list_completed'?'완료 · 100%':'진행 중'}</p><progress aria-label="목록 수집 진행" className="h-2 w-full accent-rausch" value={p?.status==='list_completed'?1:0} max={1}/></div>
  <div className="space-y-2"><div className="flex justify-between text-sm"><span>상세 확인 {num(d?.processed)} / {num(d?.total)} 물건</span><span>남음 {num(d?.remaining)} 물건</span></div><progress className="h-2 w-full accent-rausch" value={d?.processed??0} max={d?.total||1}/></div>
  {tiles([['사진 링크 확보 물건',d?.withPhotos],['공식 사진 링크',d?.photos],['감정평가서 확보 물건',d?.withDocuments],['감정평가서 링크',d?.documents]])}
  <p className="text-sm">상세 연결 {num(d?.matchedConditions)} 조건 · API 상세 미제공 {num(d?.missingConditions)} 조건 · 상세 DB 처리 {num(d?.dbRows)}건</p>
  <div className="space-y-2 text-sm"><p>오늘 목록 API {num(p?.serviceUsage?.list)} / 1,000회 · 남음 {num(p?Math.max(0,1000-(p.serviceUsage?.list??0)):undefined)}회</p><p>오늘 상세 API {num(p?.serviceUsage?.detail)} / 1,000회 · 남음 {num(p?Math.max(0,1000-(p.serviceUsage?.detail??0)):undefined)}회</p></div>
  {p?.detailStatus==='budget_wait'&&<p className="text-sm">오늘 상세 API 요청 한도에 도달했습니다. 다음 날 오전 10시 자동 실행(또는 수동 실행) 때 이어서 받습니다.</p>}
  <p className="text-xs text-muted-foreground">한 물건의 여러 입찰 회차는 조건별 자료로 구분합니다. 사진·문서 수는 물건별 중복 링크를 제거한 값입니다. 사진 중 썸네일 링크 {num(d?.thumbnails)}개이며 원본 전체 사진 다운로드 완료를 뜻하지 않습니다. 감정평가서는 API가 제공한 공식 링크이고 공고문·계약서 제공 여부는 별도 확인합니다.</p>
  {p?.error&&<p className="text-sm text-rausch">최근 오류: {p.error} · 수집 감시에서 원인을 조사합니다.</p>}
  {unavailable&&<p className="text-sm text-rausch">진행 정보를 갱신하지 못했습니다. 아래 수치는 마지막으로 확인한 값입니다.</p>}
  <p className="text-xs text-muted-foreground">상세 DB 반영 {d?.dbUpdatedAt?new Date(d.dbUpdatedAt).toLocaleString('ko-KR'):'—'} · 최근 진행 {d?.updatedAt?new Date(d.updatedAt).toLocaleString('ko-KR'):p?.updatedAt?new Date(p.updatedAt).toLocaleString('ko-KR'):'—'} · 화면 10초마다 갱신</p>
 </CardContent></Card>;
}


