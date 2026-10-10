// A navigation timeout may be a slow page, never a reason to retry an access denial.
export async function navigateWithTimeoutRecovery({navigate,guard,ready,stopped,wait,record,budget}) {
  try { await navigate(); return; } catch(error) {
    if(error.name !== 'TimeoutError') throw error;
    await record({stage:'navigation-timeout',message:error.message});
    await guard();
    if(await stopped()) throw Error('User STOP exists');
    if(await ready()) { await record({stage:'navigation-ready-after-timeout'}); return; }
    if(budget.remaining <= 0) throw error;
    budget.remaining--;
    await record({stage:'navigation-retry-wait',remainingRetries:budget.remaining});
    await wait(15000);
    if(await stopped()) throw Error('User STOP exists');
    await guard();
    // Exactly one retry for this navigation; a second timeout propagates.
    await navigate();
    await guard();
    await record({stage:'navigation-recovered'});
  }
}
