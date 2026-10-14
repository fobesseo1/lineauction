-- Copy kind and region from market_places onto market_area_stats so the 실거래 tab can filter and
-- count without joining (빌라 made the join slow for the 3s anon timeout).
alter table public.market_area_stats add column kind text, add column sido text, add column sigungu text;
create index market_area_stats_kind_count_idx on public.market_area_stats (kind, sale_count desc) where sale_count > 0;
create index market_area_stats_kind_region_idx on public.market_area_stats (kind, sido, sigungu) where sale_count > 0;
