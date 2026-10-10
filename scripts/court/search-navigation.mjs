// Reuse the current official UI when its ordinary search navigation is usable.
export async function enterCaseSearch({guard,stopped,canReuse,openHome,closeNotices,clickSearch,record}) {
  if(await stopped()) throw Error('User STOP exists');
  const reuse=await canReuse();
  if(reuse) await guard();
  else await openHome();
  await closeNotices();
  await guard();
  if(await stopped()) throw Error('User STOP exists');
  await record({stage:'search-navigation',reused:reuse});
  await clickSearch();
}
