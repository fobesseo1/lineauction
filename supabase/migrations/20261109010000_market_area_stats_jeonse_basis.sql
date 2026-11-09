-- Which contracts market_area_stats.jeonse_median and jeonse_count were taken from.
-- Add-only: lineestate reads it for the '거래 적음' mark. Filled by scripts/molit/publish.mjs.
alter table public.market_area_stats add column if not exists jeonse_basis text;

comment on column public.market_area_stats.jeonse_basis is
  'new = median of 신규 contracts (3 or more in the period); all = every jeonse contract (fewer than 3 new)';

notify pgrst, 'reload schema';
