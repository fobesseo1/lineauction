// Stop a sync that would remove far more than a normal day does (an empty or broken local ledger
// looks exactly like "everything disappeared"). Nothing is removed; the operator chat
// (TELEGRAM_CHAT_ID) is told and the step fails. --allow-large-delete lets an intended one through.
import {appendFile,mkdir} from 'node:fs/promises';
import {sendMessage} from '../alerts/telegram.mjs';

export const allowLargeDelete=process.argv.includes('--allow-large-delete');
// Over the limit = more than `ratio` of what exists AND more than `floor` rows (small tables churn).
export const overLimit=({removed,total,ratio=0.05,floor=100})=>removed>floor&&removed>total*ratio;

const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
const pct=(a,b)=>b?`${(a/b*100).toFixed(1)}%`:'—';

// checks: [{name, removed, total, ratio?, floor?}]. Throws LARGE_DELETE_BLOCKED when any is over.
export async function guardDeletes(job,checks){
 const over=checks.filter(overLimit);
 if(!over.length||allowLargeDelete)return;
 const lines=over.map(c=>`• ${c.name}: ${c.removed.toLocaleString('ko-KR')} / ${c.total.toLocaleString('ko-KR')} (${pct(c.removed,c.total)}, 한도 ${((c.ratio??0.05)*100).toFixed(0)}%)`);
 await mkdir('data/daily',{recursive:true});
 await appendFile('data/daily/delete-guard.jsonl',JSON.stringify({job,at:new Date().toISOString(),over})+'\n');
 const chat=process.env.TELEGRAM_CHAT_ID;
 if(chat&&process.env.TELEGRAM_BOT_TOKEN){
  const r=await sendMessage(chat,`<b>⚠️ ${esc(job)}: 평소보다 많이 지우려 해서 멈춤</b>\n\n${lines.map(esc).join('\n')}\n\n아무것도 지우지 않았습니다. 이 컴퓨터의 수집 기록이 비었거나 잘못됐을 수 있습니다. 확인 뒤 의도한 삭제면 --allow-large-delete 로 다시 실행하세요.`);
  if(!r.ok)console.error('telegram failed',r.description);
 }
 throw Error(`LARGE_DELETE_BLOCKED ${over.map(c=>`${c.name} ${c.removed}/${c.total}`).join(', ')}`);
}
