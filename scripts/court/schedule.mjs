import {date,money} from './core.mjs';
// Read only the explicitly headed five-column detail schedule table.
export function detailSchedule(raw) {
  const block=String(raw??'').split(/기일\t기일종류\t기일장소\t최저매각가격\t기일결과\r?\n/)[1]?.split('목록번호,목록구분,상세내역')[0];
  if(!block)return[];
  return block.split(/\r?\n/).flatMap(line=>{
    const cells=line.split('\t');
    if(cells.length!==5||!/^\d{4}\.\d{2}\.\d{2}\s*\(/.test(cells[0])||cells[1].trim()!=='매각기일')return[];
    const day=date(cells[0]);if(!day)return[];
    return[{date:day,minimumBidWon:money(cells[3]),result:cells[4].trim()||null,raw:line}];
  });
}
