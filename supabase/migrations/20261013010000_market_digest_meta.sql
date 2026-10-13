-- The daily publish writes only new or changed rows (compared by digest) instead of rewriting
-- every row, which kept doubling these tables on the free-tier DB. The 12-month window is
-- published once in market_summary_meta; per-row period_start/period_end keep the value from
-- when that row last changed.
alter table public.market_places add column digest text;
alter table public.market_area_stats add column digest text;
create table public.market_summary_meta (
  id integer primary key check (id = 1),
  published_at timestamptz not null,
  period_start date not null,
  period_end date not null
);
alter table public.market_summary_meta enable row level security;
create policy market_summary_meta_read on public.market_summary_meta for select to anon, authenticated using (true);
revoke all on public.market_summary_meta from anon, authenticated;
grant select on public.market_summary_meta to anon, authenticated;
