-- Link each apartment-section property to its MOLIT building (market_places.id) and 평형 type,
-- and record how much the discount can be trusted. Filled by scripts/molit/analyze.mjs.
--   confidence high   : >=3 same-type sales in the last 6 months
--              medium : >=3 in the last 12 months
--              low    : fewer, or a neighbouring 평형 type was used
alter table public.property_analysis add column place_id text, add column area_type integer,
  add column confidence text check (confidence in ('high','medium','low'));
create index property_analysis_place_idx on public.property_analysis (place_id);
