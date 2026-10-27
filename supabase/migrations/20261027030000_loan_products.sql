-- 주택담보대출·전세자금대출 상품 × 금리 옵션, from 금융감독원 금융상품한눈에 공개 API (은행·저축은행·보험 등
-- 대출을 공시하는 금융회사 전부; "출처: 금융감독원 금융상품통합비교공시, 기준월 ○○"). One row per product ×
-- 담보 종류 × 상환 방식 × 금리 유형. Written daily by scripts/finance/finlife-products.mjs, changed rows only;
-- a product the API no longer lists is removed. bank_loan_rates (은행연합회 평균금리) stays alongside.
create table public.loan_products (
  id bigint generated always as identity primary key,
  product_kind text not null check (product_kind in ('mortgage','jeonse')),  -- 주담대 / 전세대출
  fin_group text not null,           -- 은행 / 저축은행 / 보험 / 여신전문 / 금융투자
  fin_co_code text not null,         -- 금융회사 코드 (fin_co_no)
  fin_co_name text not null,
  homepage_url text,                 -- 금융회사 홈페이지 (companySearch)
  product_code text not null,        -- fin_prdt_cd
  product_name text not null,
  collateral_type text not null default '',  -- 주담대 담보 종류 (아파트 / 아파트외); 전세대출은 ''
  repayment_type text not null,      -- 분할상환방식 / 만기일시상환방식
  rate_type text not null,           -- 고정금리 / 변동금리 / 혼합 (금융회사 표기 그대로)
  rate_min numeric(5,2),             -- 대출금리 최저 %
  rate_max numeric(5,2),             -- 대출금리 최고 %
  rate_avg numeric(5,2),             -- 전월 취급 평균금리 % (없으면 null)
  loan_limit text,                   -- 대출 한도 문구
  join_way text,                     -- 가입 방법 (영업점, 인터넷, 스마트폰, 모집인 …)
  disclosure_month text not null check (disclosure_month ~ '^\d{4}-\d{2}$'),  -- 공시 기준월
  fetched_on date not null,          -- 받은 날짜 (KST)
  unique (product_kind, fin_co_code, product_code, collateral_type, repayment_type, rate_type)
);
create index loan_products_kind_rate_idx on public.loan_products (product_kind, rate_min);
alter table public.loan_products enable row level security;
create policy loan_products_read on public.loan_products for select to anon, authenticated using (true);
revoke all on public.loan_products from anon, authenticated;
grant select on public.loan_products to anon, authenticated;
comment on table public.loan_products is '주담대·전세대출 상품별 금리. 출처: 금융감독원 금융상품통합비교공시 (금융상품한눈에), 기준월은 disclosure_month';
