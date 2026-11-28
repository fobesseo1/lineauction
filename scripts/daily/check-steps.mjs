// Today's daily-run steps that went wrong (scripts/daily/step-check.mjs). Local files only, so it is fast
// enough to run on every prompt as a Claude Code hook.
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {koreanDay} from './core.mjs';
import {dayProblems,asksAboutFactory} from './step-check.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const lines=async path=>(await readFile(root+path,'utf8').catch(()=>'')).split(/\r?\n/).filter(Boolean).flatMap(l=>{try{return [JSON.parse(l)];}catch{return [];}});
const LABEL={market:'단지·실거래',onbid:'온비드 공매',court:'법원 경매'};
const hook=process.argv.includes('--hook');

let prompt='';
if(hook){let raw='';process.stdin.setEncoding('utf8');for await(const chunk of process.stdin)raw+=chunk;try{prompt=JSON.parse(raw).prompt??'';}catch{prompt='';}}
const day=koreanDay();
const [runs,reruns,guards]=await Promise.all([lines('data/daily/runs.jsonl'),lines('data/daily/reruns.jsonl'),lines('data/daily/delete-guard.jsonl')]);
const problems=dayProblems(runs,reruns,day);
const guardToday=guards.filter(g=>g.job!=='test'&&g.at&&koreanDay(new Date(g.at))===day);
const report=[
 `[공장 단계 검사 ${day}] 작업 전체가 "완료"여도 아래 단계는 문제가 있다. 사용자에게 바로 말하고 원인을 본다.`,
 ...problems.map(p=>`- ${LABEL[p.job]??p.job} / ${p.step}: ${p.why}`),
 ...(guardToday.length?[`- 오늘 삭제 안전장치 기록 ${guardToday.length}건 (data/daily/delete-guard.jsonl)`]:[]),
].join('\n');

if(hook){
 // Silent unless something is wrong and the prompt is about the factory.
 if(problems.length&&asksAboutFactory(prompt))process.stdout.write(report+'\n');
 process.exit(0);
}
console.log(problems.length?report:`[공장 단계 검사 ${day}] 문제 없음`);
process.exit(problems.length?1:0);
