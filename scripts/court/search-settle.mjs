// Observe rendered search tables until unchanged; no additional server requests.
export async function settleSearchTables({read,wait,guard,stopped,maxPolls=20}) {
  let previous=null,stable=0;
  for(let n=0;n<maxPolls;n++){
    if(await stopped()) throw Error('User STOP exists');
    const text=await read();
    if(text===previous)stable++;else stable=0;
    if(stable>=2){await guard();return;}
    previous=text;await wait(100);
  }
  throw Error('Case search tables did not settle');
}
