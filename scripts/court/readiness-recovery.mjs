// Extend observation of an already requested screen; never click or reload here.
export async function waitForScreenReady({observe,guard,stopped,record,budget,stage,timeout}) {
  await record({stage:'screen-wait',screen:stage});
  try { await observe(timeout); } catch(error) {
    if(error.name !== 'TimeoutError') throw error;
    await record({stage:'screen-timeout',screen:stage,message:error.message});
    if(await stopped()) throw Error('User STOP exists');
    try{await guard();}catch(guardError){
      if(guardError.name!=='TimeoutError')throw guardError;
      // Reading body can time out during a document transition. No action or request
      // is allowed until the final guard succeeds after this passive observation.
      await record({stage:'guard-read-timeout',screen:stage,message:guardError.message});
    }
    if(budget.remaining <= 0) throw error;
    budget.remaining--;
    await record({stage:'screen-wait-extended',screen:stage,remainingExtensions:budget.remaining});
    await observe(40000);
  }
  await guard();
}
