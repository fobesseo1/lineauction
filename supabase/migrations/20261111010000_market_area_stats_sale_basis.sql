-- lineestate's representative sale price per building+평형 (request 15, "C안").
-- Add-only: sale_median and the other columns stay as they are. Filled daily by
-- scripts/molit/publish.mjs (saleBasis in scripts/molit/summary.mjs).
alter table public.market_area_stats
  add column if not exists sale_basis_price integer,
  add column if not exists sale_basis_months smallint,
  add column if not exists sale_basis_n integer;

comment on column public.market_area_stats.sale_basis_price is
  '만원. Valid sales (no cancelled, no 직거래): mean of the last 91 days if 3+; else mean of the last 183 days if 3+; else 12-month median (= sale_median) if 1+; else mean of the 36-month window';
comment on column public.market_area_stats.sale_basis_months is
  'Period sale_basis_price came from: 3, 6, 12 or 36';
comment on column public.market_area_stats.sale_basis_n is
  'Number of valid sales in that period';

notify pgrst, 'reload schema';
