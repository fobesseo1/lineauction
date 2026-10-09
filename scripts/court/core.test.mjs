import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { money, date, parseList, parseDetail, reconcile, courtRowMatches } from './core.mjs';
import { saveRun } from './store.mjs';
const court = '서울중앙지방법원';
const cells = values => values.map(text => ({ text, rowSpan: 1 }));
const header = (number = '1') => cells(['', `${court}\n2023타경113350\n2023타경117390(중복)`, number,
  '서울특별시 강남구 선릉로 221\n[집합건물 119.8906㎡]', '지도', '', '3,320,000,000', '경매11계\n2026.10.08']);
const price = () => cells(['아파트', '2,656,000,000\n(80%)', '유찰 1회']);
const page = (rows = [header(), price()]) => ({ court, page: 1, displayedTotal: 1,
  observedAt: '2026-10-07T02:00:00.000Z', sourceUrl: 'https://www.courtauction.go.kr/pgj/index.on', rows });
const run = p => ({ schemaVersion: 1, court, pages: [p ?? page()], details: {}, errors: [] });
test('공식 지원 약칭은 선택한 법원 키에만 연결한다',()=>{
 assert.equal(courtRowMatches('동부지원\n2024타경1','부산동부지원'),true);
 assert.equal(courtRowMatches('서부지원\n2024타경1','부산서부지원'),true);
 assert.equal(courtRowMatches('동부지원\n2024타경1','서울동부지방법원'),false);
 assert.equal(courtRowMatches('서울중앙지방법원\n2024타경1','부산동부지원'),false);
});
test('원 금액과 유효한 날짜만 변환; 누락값을 0으로 채우지 않음', () => {
  assert.equal(money('2,656,000,000원\n(80%)'), 2656000000);
  assert.equal(money('가격 미정'), null);
  assert.equal(money(''), null);
  assert.equal(date('2026.02.30'), null);
  assert.equal(date('경매11계\n2026.10.08'), '2026-10-08');
});
test('일괄 토지·건물은 1건, 동일 사건 물건번호는 별개, 중복사건 보존', () => {
  const extra = cells(['', '', '', '관악구 건물\n[건물 59.37㎡]', '지도', '', '', '']);
  const p = page([header(), price(), extra, cells(['', '', '']), header('2'), price()]);
  const items = parseList(p);
  assert.equal(items.length, 2);
  assert.equal(items[0].assets.length, 2);
  assert.deepEqual(items[0].relatedCases, ['2023타경117390']);
  assert.notEqual(items[0].key, items[1].key);
});
test('페이지 반복이나 알 수 없는 표 구조를 조용히 수용하지 않음', () => {
  const r = run(); r.pages.push({ ...page(), page: 2 });
  assert.throws(() => reconcile(null, r), /Duplicate item/);
  assert.throws(() => parseList(page([cells(['unexpected'])])), /layout/);
  assert.throws(() => parseList(page([])), /Empty/);
});
test('부분 수집에서 안 보인 물건을 취하로 바꾸지 않음', () => {
  const state = reconcile(null, run()).state;
  const other = page([header('2'), price()]); other.displayedTotal = 503;
  const result = reconcile(state, run(other));
  assert.equal(result.report.coverage, 'partial');
  assert.equal(result.state.items[`${court}:2023타경113350:1`].observationStatus, 'observed');
});
test('재수집 시 신규/동일/최저가 변경을 구별하고 변경 전후 저장', () => {
  const first = reconcile(null, run());
  assert.equal(first.report.events[0].type, 'new');
  assert.equal(reconcile(first.state, run()).report.events[0].type, 'unchanged');
  const p = page(); p.rows[1][1].text = '2,100,000,000\n(63%)';
  const event = reconcile(first.state, run(p)).report.events[0];
  assert.equal(event.type, 'changed');
  assert.deepEqual(event.changes.minimumBidWon, { before: 2656000000, after: 2100000000 });
});
test('상세 전유부분 면적만 추출; 건물 전체 층별 면적 사용 금지', () => {
  const item = parseList(page())[0];
  const raw = '사건번호 2023타경113350 물건번호 1 물건종류 아파트\n1층 635.5404㎡\n전유부분의 건물의 표시\n건물번호 407동 9층903호\n면적 119.8906㎡\n대지권 133361.6㎡';
  assert.equal(parseDetail(raw, item).exclusiveAreaM2, 119.8906);
  assert.equal(parseDetail(raw.split('전유부분')[0], item).exclusiveAreaM2, null);
  assert.equal(parseDetail(raw.replace('면적 119.8906㎡', '면적 미기재'), item).exclusiveAreaM2, null);
  assert.equal(parseDetail(raw.replace('면적 119.8906㎡', '구조 : 철근콘크리트조 38.1㎡'), item).exclusiveAreaM2, 38.1);
  assert.throws(() => parseDetail(raw.replace('물건번호 1', '물건번호 2'), item), /item mismatch/);
});
test('공식 출처/법원/시간 검증 및 역순 업데이트 거절', () => {
  const bad = page(); bad.sourceUrl = 'https://example.com';
  assert.throws(() => reconcile(null, run(bad)), /Invalid source/);
  const state = reconcile(null, run()).state;
  const old = page(); old.observedAt = '2026-10-06T02:00:00.000Z';
  assert.throws(() => reconcile(state, run(old)), /Out-of-order/);
});
test('누락 가격은 검토 대상으로 보존하고 완전 수집으로 표시하지 않음', () => {
  const p = page(); p.rows[1][1].text = '';
  const result = reconcile(null, run(p));
  assert.equal(result.report.coverage, 'partial');
  assert.equal(Object.values(result.state.items)[0].minimumBidWon, null);
  assert.deepEqual(result.report.invalidItems, [`${court}:2023타경113350:1`]);
});
test('완전 검색에서 사라져도 매각/취하를 추정하지 않고 재확인 상태', () => {
  const state = reconcile(null, run()).state;
  const empty = page([]); empty.displayedTotal = 0;
  const result = reconcile(state, run(empty));
  assert.equal(result.state.items[`${court}:2023타경113350:1`].observationStatus, 'needs-recheck');
});
test('원문·실행 기록·현재 상태 저장, 잘못된 입력은 정상 상태 보존', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'court-test-'));
  const saved = await saveRun(run(), directory);
  assert.equal(JSON.parse(await readFile(join(saved.runPath, 'raw.json'), 'utf8')).court, court);
  const before = await readFile(saved.currentPath, 'utf8');
  const bad = run(page([]));
  await assert.rejects(saveRun(bad, directory));
  assert.equal(await readFile(saved.currentPath, 'utf8'), before);
});
test('실제 법원 3·4페이지 원문: 18개 물건, 토지·건물 묶음과 전유면적 검증', async () => {
  const observed = JSON.parse(await readFile(new URL('./fixtures/seoul-central-2026-10-07.json', import.meta.url), 'utf8'));
  const { state, report } = reconcile(null, observed);
  assert.equal(report.observedItems, 18);
  assert.equal(report.coverage, 'partial');
  assert.equal(report.displayedTotal, 503);
  assert.deepEqual(report.invalidItems, []);
  assert.equal(state.items[`${court}:2023타경106314:1`].assets.length, 2);
  assert.equal(state.items[`${court}:2023타경111613:1`].assets.length, 2);
  const target = state.items[`${court}:2023타경113350:1`];
  assert.equal(target.detail.exclusiveAreaM2, 119.8906);
  assert.equal(target.minimumBidWon, 2656000000);
  assert.equal(reconcile(state, observed).report.events.filter(e => e.type === 'unchanged').length, 18);
});
test('실제 8→9→10→11페이지에서 페이지 경계 일괄매각의 자산을 합침', async () => {
  const observed = JSON.parse(await readFile(new URL('./fixtures/seoul-boundaries-2026-10-07.json', import.meta.url), 'utf8'));
  const { state, report } = reconcile(null, observed);
  const bundle = state.items[`${court}:2024타경100474:2`];
  assert.equal(bundle.assets.length, 5);
  assert.deepEqual(bundle.observedPages, [9, 10]);
  assert.equal(state.items[`${court}:2024타경4347:1`].assets.length, 2);
  assert.equal(report.coverage, 'partial');
  assert.equal(observed.pages.at(-1).page, 57);
  assert.equal(observed.pages.at(-1).rows.length, 8); // 4 visible properties; hidden stale rows absent.
});
test('잘못된 상세는 해당 작업만 실패하고 목록은 보존', () => {
  const r = run(); const key = `${court}:2023타경113350:1`;
  r.details[key] = '2023타경113350 물건번호 2 물건종류 아파트';
  r.detailJobs = [{ key, page: 1, state: 'succeeded', attempts: 1 }];
  const result = reconcile(null, r);
  assert.equal(result.report.observedItems, 1);
  assert.equal(result.report.coverage, 'complete-query');
  assert.equal(result.state.detailQueue[key].state, 'failed');
  assert.equal(result.state.items[key].detail, null);
});
test('실패 상세 재수집 성공 시 큐에서 제거', () => {
  const key = `${court}:2023타경113350:1`;
  const first = run(); first.detailJobs = [{ key, page: 1, state: 'failed', attempts: 2, error: 'timeout' }];
  first.errors = [{ stage: 'detail', key, message: 'timeout' }];
  const before = reconcile(null, first).state;
  const next = run(); next.details[key] = '2023타경113350 물건번호 1 물건종류 아파트 전유부분 면적 119.8906㎡';
  next.detailJobs = [{ key, page: 1, state: 'succeeded', attempts: 1 }];
  assert.equal(reconcile(before, next).state.detailQueue[key], undefined);
});
test('부분 수집이 이미 모은 일괄매각 자산을 삭제하지 않음', () => {
  const first = run(); first.pages[0].rows.splice(2, 0,
    cells(['', '', '', '추가 건물\n[건물 59.37㎡]', '지도', '', '', '']), cells(['', '', '']));
  const before = reconcile(null, first).state;
  const partial = run(); partial.pages[0].displayedTotal = 503;
  const result = reconcile(before, partial);
  assert.equal(Object.values(result.state.items)[0].assets.length, 2);
  assert.equal(result.report.events[0].type, 'unchanged');
});
test('같은 물건의 서로 다른 페이지 가격이 다르면 임의 병합하지 않음', () => {
  const r = run(); const second = page(); second.page = 2;
  second.rows[0][3].text = '추가 토지\n[토지 50㎡]';
  second.rows[1][1].text = '1,000,000,000'; r.pages.push(second);
  assert.throws(() => reconcile(null, r), /Duplicate/);
});
test('차량은 부동산 상세 수집 큐에서 제외하고 기타는 분류 대기', () => {
  const r = run(); r.pages[0].rows[1][0].text = '자동차,중기';
  const result = reconcile(null, r);
  assert.equal(result.report.nonRealEstateCount, 1);
  assert.equal(Object.keys(result.state.detailQueue).length, 0);
  r.pages[0].rows[1][0].text = '기타';
  assert.equal(reconcile(null, r).report.classificationNeededCount, 1);
});
test('반복 실패 횟수·시각 보존 및 새 목록에서 대기열 위치 갱신',()=>{
 const key=`${court}:2023타경113350:1`;
 const first=run();first.detailJobs=[{key,page:1,state:'failed',attempts:2,error:'timeout'}];
 const before=reconcile(null,first).state;
 const next=run();next.pages[0].page=3;next.pages[0].observedAt='2026-10-07T05:00:00Z';next.pageSize=40;next.detailJobs=[{key,page:3,state:'failed',attempts:1,error:'timeout'}];
 const job=reconcile(before,next).state.detailQueue[key];
 assert.equal(job.attempts,3);assert.equal(job.page,3);assert.equal(job.pageSize,40);assert.equal(job.lastAttemptAt,'2026-10-07T05:00:00Z');
});
