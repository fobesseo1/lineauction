// Retry only an empty detail error response, after access and STOP guards.
export async function recoverBlankDetail({openDetail,inspect,guard,stopped,reopen,budget,record}){
 try{await openDetail();return;}catch(error){
  if(error.name!=='TimeoutError')throw error;
  if(await stopped())throw Error('User STOP exists');
  await guard();
  const d=await inspect();
  if(!d.emptyDetail||!d.errorDialog||d.accessDenied||budget.remaining<=0)throw error;
  budget.remaining--;
  await record({stage:'blank-detail-recovery',remainingRecoveries:budget.remaining});
  await reopen();
  await guard();
  if(await stopped())throw Error('User STOP exists');
  await openDetail();
 }
}
