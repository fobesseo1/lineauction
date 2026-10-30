-- How a MOLIT building got (or did not get) its K-APT complex, and how an auction property got its
-- building, so lineestate can badge only certain links.
--   market_places.kapt_match      : 'pnu' | 'name' | 'near_name' | 'not_in_kapt' (apt only; null for other kinds)
--   property_analysis.place_match_method : 'pnu' | 'lot' | 'lot+name' | 'name' | 'kapt_pnu' (null when no building)
alter table public.market_places add column if not exists kapt_match text;
alter table public.property_analysis add column if not exists place_match_method text;
