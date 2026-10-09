import {mapCourtProperty} from './pipeline-core.mjs';
import {inSeoulGyeonggi} from './scope.mjs';
import {lifecycleFromItem} from './lifecycle.mjs';

export function recoveryStatus(state,media,checks,{since}) {
 const photographed=new Set(media.map(x=>x.key));
 const counts={total:0,completed:0,pending:0,failed:0,excluded:0};
 const items=[];
 for(const item of Object.values(state.items)){
  if(!inSeoulGyeonggi(item)||!mapCourtProperty(item))continue;
  const check=checks[item.key],fresh=Date.parse(check?.evidence?.observedAt??0)>=Date.parse(since);
  const closed=lifecycleFromItem(item),excluded=closed.state==='closed';
  const field=(present,name)=>present?{state:'completed'}:excluded?{state:'excluded',reason:closed.reason}:!fresh?{state:'pending'}:{state:'failed',reason:check.state==='property-not-provided'?'공식 사건검색에 해당 물건 미제공':check.state==='detail-disabled'?'공식 상세 조회 버튼 비활성':name==='photo'?'상세 화면에 수집 가능한 공식 사진 없음':'상세 저장 실패'};
  const detail=field(!!item.detail,'detail'),photo=field(photographed.has(item.key),'photo');
  const status=detail.state==='completed'&&photo.state==='completed'?'completed':excluded?'excluded':[detail,photo].some(x=>x.state==='failed')?'failed':'pending';
  counts.total++;counts[status]++;items.push({key:item.key,status,detail,photo,checkedAt:fresh?check.evidence.observedAt:null});
 }
 return {checkedAt:new Date().toISOString(),since,counts,items,passFinished:counts.pending===0,allDataAcquired:counts.completed===counts.total};
}
