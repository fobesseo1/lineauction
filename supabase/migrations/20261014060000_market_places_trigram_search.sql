-- Name search over ~194k buildings (빌라 included): trigram indexes for ilike '%term%' on the
-- columns lineestate searches. Terms shorter than 3 characters cannot use them.
create extension if not exists pg_trgm with schema extensions;
create index if not exists market_places_name_trgm on public.market_places using gin (name extensions.gin_trgm_ops);
create index if not exists market_places_umd_trgm on public.market_places using gin (umd extensions.gin_trgm_ops);
create index if not exists market_places_sigungu_trgm on public.market_places using gin (sigungu extensions.gin_trgm_ops);
analyze public.market_places;
