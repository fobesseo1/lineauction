-- lineestate request 2026-10-21: site queries (anon, 3s) timing out while daily jobs run.
-- Bulk-rewritten tables are vacuumed/analyzed sooner so index-only scans stay cheap.
alter table public.market_area_stats set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table public.market_rents set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table public.market_trades set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table public.market_places set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table public.market_commercial_trades set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table public.onbid_observations set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
alter table public.properties set (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
-- Section lists count current properties by section and region.
create index if not exists properties_current_section_sido_idx on public.properties (section, sido) where is_current;
-- Search: title / address ilike '%word%'.
create index if not exists properties_title_trgm on public.properties using gin (title extensions.gin_trgm_ops);
create index if not exists properties_address_trgm on public.properties using gin (address extensions.gin_trgm_ops);
