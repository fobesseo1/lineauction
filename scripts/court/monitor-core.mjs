export function pipelineHealth(pipeline,progress,{matchingPaused=false}={}){
 const current=!!pipeline?.finishedAt&&Date.parse(pipeline.finishedAt)>=Date.parse(progress?.lastSyncAt??progress?.startedAt??0)-2000;
 const errors=current?(pipeline.errors??[]):[];
 const dbErrors=errors.filter(e=>e.stage!=='matching');
 const matchingErrors=errors.filter(e=>e.stage==='matching');
 return {
  database:{state:current?(dbErrors.length?'failed':'completed'):'unknown',errors:current?dbErrors.length:null,finishedAt:current?pipeline.finishedAt:null},
  matching:{state:matchingPaused?'paused':matchingErrors.length?'deferred':'completed',pending:current?new Set(matchingErrors.map(e=>e.key)).size:null,errors:matchingErrors.length,message:matchingPaused?'국토부 요청 제한으로 조회를 보류했습니다. 기존 비교 자료는 유지하며 미처리 물건은 나중에 다시 매칭합니다.':matchingErrors.length?'일부 실거래 조회에 실패했습니다. 법원 자료 저장과 별개이며 미처리 물건은 나중에 다시 매칭합니다.':'최근 실거래 매칭 처리를 완료했습니다.'},
 };
}
export function classifyHealth({progress,alive,lastActivityAt,now=Date.now(),pipeline,matchingPaused=false}){
 if(!progress)return {state:'unavailable',label:'실행 기록 없음',message:'아직 수집 실행 기록이 없습니다.'};
 if(progress.status==='blocked')return {state:'error',label:'오류로 중지',message:'수집 오류로 중지됐습니다. 아래 오류 내용을 확인하세요.'};
 if(['stopped','limit-reached','pass-finished','pass-finished-with-errors'].includes(progress.status))return {state:'stopped',label:'실행 종료',message:progress.status==='pass-finished'?'이번 순회를 마쳤습니다. 전체 자료 보강 완료와는 별개입니다.':'수집 실행이 종료됐습니다. 전체 완료를 뜻하지 않습니다.'};
 if(alive===false)return {state:'error',label:'예상치 못한 중지',message:'진행 중으로 기록됐지만 수집 프로세스가 종료됐습니다.'};
 if(alive===null)return {state:'unknown',label:'실행 여부 미확인',message:'프로세스를 확인할 권한이 없어 정상 실행 여부를 판단하지 못했습니다.'};
 const syncing=progress.syncStatus==='running';
 const age=now-Date.parse(lastActivityAt??progress.startedAt);
 if(!Number.isFinite(age)||age>(syncing?15*60000:2*60000))return {state:'delayed',label:'지연 의심',message:syncing?'DB 반영이 15분 이상 진행되지 않았습니다.':'수집 프로세스는 살아 있지만 2분 이상 새 처리 기록이 없습니다.'};
 if(progress.status==='recovering')return {state:'recovering',label:'자동 복구 중',message:`일시적인 목록 변경 또는 응답 지연으로 ${progress.recovery?.delaySeconds??'잠시'}초 대기 후 검색을 다시 시작합니다. 저장한 자료는 유지합니다. 연속 복구 실패 시 중지하고 알립니다.`};
 if(progress.syncStatus==='failed'){
  const stages=pipelineHealth(pipeline,progress,{matchingPaused});
  if(stages.database.state==='completed')return {state:'healthy',label:'수집 중 · 실거래 매칭 보류',message:'법원 자료 DB 저장은 완료됐습니다. 실거래 조회가 안 된 물건은 보류하고 수집을 계속합니다.'};
  return {state:'warning',label:stages.database.state==='failed'?'DB 저장 오류':'DB 반영 결과 확인 필요',message:stages.database.state==='failed'?'최근 DB 저장 단계에 오류가 있습니다. 로컬 수집 자료는 유지됩니다.':'최근 반영이 정상 완료되지 않았습니다. DB 저장 결과를 확인해야 합니다.'};
 }
 return {state:'healthy',label:syncing?'DB 반영 중':'수집 중',message:syncing?'수집한 자료를 DB와 실거래 비교에 반영하고 있습니다.':'수집기가 실행 중이며 최근 처리 기록이 확인됩니다.'};
}
