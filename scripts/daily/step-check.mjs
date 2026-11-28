// Steps of a daily run that went wrong, even when the run as a whole says "completed" (2026-11-28):
// onbid-lifecycle stopped by the delete guard on 11-27 and 11-28 and nobody noticed; molit got
// 0 region-months on 11-28 (API_04) and still exited 0.
//   node scripts/daily/check-steps.mjs            → prints today's problems, exit 1 when there are any
//   node scripts/daily/check-steps.mjs --hook     → Claude Code UserPromptSubmit hook (see .claude/settings.json)
const text=v=>typeof v==='string'?v:v==null?'':JSON.stringify(v);
const firstLine=s=>s.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).at(-1)?.slice(0,160)??'';

// One step's problem in plain words, or null.
export function stepProblem(s){
 const out=text(s.result);
 if(s.timedOut)return '시간 초과';
 if(s.code!==0)return /LARGE_DELETE_BLOCKED/.test(out)?`안전장치에 걸려 멈춤 (${firstLine(out)})`:firstLine(out)||`종료 코드 ${s.code}`;
 const stopped=out.match(/\(stopped: ([^)]*)\)/);if(stopped)return `성공으로 끝났지만 중간에 멈춤: ${stopped[1]}`;
 if(/^DONE loaded 0 region-months/.test(out))return '국토부 실거래를 하나도 받지 못함';
 return null;
}

// The day's last finished run per job (runs.jsonl also has start lines), and the steps still wrong after
// any later successful rerun (reruns.jsonl, scripts/daily/rerun-step.mjs).
export function dayProblems(runs,reruns,day){
 const out=[];
 for(const job of [...new Set(runs.filter(r=>r.day===day&&r.steps).map(r=>r.job))]){
  const run=runs.filter(r=>r.job===job&&r.day===day&&r.steps).at(-1);
  const start=run.startedAt??run.at??'';
  for(const s of run.steps){
   const why=stepProblem(s);if(!why)continue;
   if(reruns.some(r=>r.job===job&&r.step===s.name&&r.ok&&(r.day??day)===day&&(r.at??'')>=start))continue;
   out.push({job,step:s.name,why});
  }
 }
 return out;
}

// Does this prompt ask how the factory is doing?
export const asksAboutFactory=prompt=>/공장|작업|잘\s*돌|돌고|상황|상태|문제|수집|점검|확인|어때|됐/.test(String(prompt??''));
