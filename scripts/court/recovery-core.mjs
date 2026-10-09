export function isRecoverableError(error){
 const message=error?.message??String(error);
 if(/denied access|access challenge|403|429|lock exists|mismatch|not verified|Pagination limit/i.test(message))return false;
 return /Timeout \d+ms exceeded|List changed during details; refresh on resume|List failed to stabilize/.test(message);
}

// Restart only a validated court search, never continue using stale row positions.
export async function withCourtRecovery(operation,{onRetry,getSaved=()=>0,isBlocked=()=>false,maxRetries=3,maxTotalRetries=12}={}){
 let consecutive=0,total=0,lastSaved=getSaved();
 for(;;){
  try{return await operation();}
  catch(error){
   const saved=getSaved();
   if(saved>lastSaved)consecutive=0;
   lastSaved=saved;
   if(isBlocked()||!isRecoverableError(error)||consecutive>=maxRetries||total>=maxTotalRetries)throw error;
   consecutive++;total++;
   const keepGoing=await onRetry({error,attempt:consecutive,total,delaySeconds:[10,30,60][consecutive-1]??60});
   if(keepGoing===false)return 'stop';
  }
 }
}
