// Durable incident keys suppress repeats across observer restarts.
export function planNotification({progress,health,state={},now=Date.now()}){
 const run=progress?.id??'observer';
 const incident=['error','delayed','warning','unknown'].includes(health.state)
  ?`${run}:${health.state}:${health.label}:${progress?.error??''}`:null;
 const next={...state,activeIncident:incident};
 if(incident&&incident!==state.activeIncident){
  return {state:next,notification:{title:`선경매 · ${health.label}`,message:`${health.message}\n설정 화면에서 확인해 주세요.`,kind:health.state}};
 }
 const failed=progress?.failed??0;
 const previous=state.failureRun===run?state.notifiedFailures??0:0;
 if(!incident&&failed>previous&&now-(state.lastFailureAlertAt??0)>=300000){
  Object.assign(next,{failureRun:run,notifiedFailures:failed,lastFailureAlertAt:now});
  return {state:next,notification:{title:'선경매 · 일부 물건 수집 실패',message:`이번 실행에서 ${failed}건이 실패했습니다. 수집은 계속됩니다.\n설정 화면에서 실패 물건을 확인해 주세요.`,kind:'item-error'}};
 }
 return {state:next,notification:null};
}
