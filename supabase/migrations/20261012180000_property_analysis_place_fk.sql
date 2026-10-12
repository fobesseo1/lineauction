-- Lets screens join property_analysis → market_places (e.g. filter auctions by 준공연도).
-- 빌라 rows keep place_id null until villa buildings get market pages.
alter table public.property_analysis add constraint property_analysis_place_id_fkey
  foreign key (place_id) references public.market_places(id) on delete set null;
