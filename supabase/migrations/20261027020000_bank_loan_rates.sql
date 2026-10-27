-- 은행별 주택담보대출·전세자금대출 평균금리, from 전국은행연합회 소비자포털 가계대출금리 비교공시
-- ("출처: 전국은행연합회 소비자포털, 공시월 ○○", 매월 말 공시). 공시월 rows describe loans of the month before.
-- 신규취급액 rows are per CB 신용점수 구간 plus 'avg'; 잔액 rows are 'avg' only. A band where the bank lent
-- nothing has no row. Written by scripts/finance/kfb-rates.mjs; stands in until the 금감원 금융상품한눈에 API key works.
create table public.bank_loan_rates (
  disclosure_month text not null check (disclosure_month ~ '^\d{4}-\d{2}$'),  -- 공시년월
  bank_name text not null,
  loan_kind text not null check (loan_kind in ('mortgage_amortizing','mortgage_bullet','jeonse')),  -- 분할상환 주담대(만기 10년+) / 일시상환 주담대 / 전세자금대출
  basis text not null check (basis in ('new','balance')),                     -- 신규취급액 / 잔액
  score_band text not null check (score_band in ('1000-951','950-901','900-851','850-801','800-751','750-701','700-651','650-601','600-','avg')),
  rate numeric(5,2) not null,        -- 대출금리 %
  base_rate numeric(5,2),            -- 기준금리
  spread numeric(5,2),               -- 가산금리
  adjustment numeric(5,2),           -- 가감조정금리 (rate = base + spread − adjustment)
  avg_score smallint,                -- 평균 신용점수 (신규 avg row only)
  cb_name text,                      -- 신용점수 기준 CB사 (KCB / NICE)
  bank_url text,                     -- 은행 홈페이지
  fetched_at timestamptz not null default now(),
  primary key (disclosure_month, bank_name, loan_kind, basis, score_band)
);
create index bank_loan_rates_latest_idx on public.bank_loan_rates (loan_kind, basis, score_band, disclosure_month desc);
alter table public.bank_loan_rates enable row level security;
create policy bank_loan_rates_read on public.bank_loan_rates for select to anon, authenticated using (true);
revoke all on public.bank_loan_rates from anon, authenticated;
grant select on public.bank_loan_rates to anon, authenticated;
comment on table public.bank_loan_rates is '은행별 주담대·전세대출 평균금리. 출처: 전국은행연합회 소비자포털 가계대출금리 비교공시 (공시월 기준, 전월 취급분)';
