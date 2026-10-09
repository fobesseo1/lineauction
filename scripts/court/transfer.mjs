// Bounded, in-memory transport for public court JSON. Validation still happens after assembly.
export function createTransferAssembler({now=()=>Date.now(),ttl=300000,maxBytes=8*1024*1024}={}){
  const transfers=new Map();
  return function accept(input){
    for(const [id,entry] of transfers)if(now()-entry.at>ttl)transfers.delete(id);
    const {id,index,total,data}=input;
    if(typeof id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(id)||!Number.isInteger(index)||!Number.isInteger(total)||total<1||total>800||index<0||index>=total||typeof data!=='string'||data.length>16000)throw Error('Invalid transfer chunk');
    let entry=transfers.get(id);
    if(!entry){if(index!==0||transfers.size>=4)throw Error('Transfer start unavailable');entry={at:now(),total,parts:[],bytes:0};transfers.set(id,entry);}
    if(entry.total!==total||index>entry.parts.length)throw Error('Out-of-order transfer');
    if(index<entry.parts.length){if(entry.parts[index]!==data)throw Error('Conflicting transfer retry');return{received:entry.parts.length,total};}
    entry.bytes+=Buffer.byteLength(data);if(entry.bytes>maxBytes){transfers.delete(id);throw Error('Transfer exceeds 8 MB');}
    entry.parts.push(data);entry.at=now();
    if(entry.parts.length!==total)return{received:entry.parts.length,total};
    transfers.delete(id);
    const payload=JSON.parse(entry.parts.join(''));
    if(payload.kind==='court-transfer-chunk')throw Error('Nested transfer rejected');
    return{received:total,total,payload};
  };
}
