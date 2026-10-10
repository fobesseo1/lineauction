// The host timer still fires when a browser renderer stops answering.
export async function withOperationDeadline(work,ms,label) {
 let timer;
 try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error(label+' exceeded host deadline '+ms+'ms'),{name:'TimeoutError'})),ms);})]);}
 finally{clearTimeout(timer);}
}
