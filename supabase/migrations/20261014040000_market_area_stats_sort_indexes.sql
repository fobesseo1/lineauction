-- lineestate's 실거래 tab sorts market_area_stats (sale_count > 0) by count, median or last sale date;
-- with ~240k rows (빌라 included) a full sort passes the 3s anon timeout.
create index if not exists market_area_stats_count_idx on public.market_area_stats (sale_count desc) where sale_count > 0;
create index if not exists market_area_stats_median_idx on public.market_area_stats (sale_median) where sale_count > 0;
create index if not exists market_area_stats_last_idx on public.market_area_stats (sale_last_date desc) where sale_count > 0;
create index if not exists market_places_kind_sido_idx on public.market_places (kind, sido, sigungu);
