-- Properties linked to a MOLIT building take its 건축연도 when the building register gave none
-- (called at the end of scripts/molit/analyze.mjs, after links are refreshed).
create or replace function public.fill_build_year_from_places() returns integer
language sql security invoker set search_path = '' as $$
  with changed as (
    update public.properties p set build_year = m.build_year
    from public.property_analysis a join public.market_places m on m.id = a.place_id
    where a.property_id = p.id and p.build_year is null and m.build_year is not null
    returning 1
  )
  select count(*)::integer from changed;
$$;
revoke all on function public.fill_build_year_from_places() from public, anon, authenticated;
grant execute on function public.fill_build_year_from_places() to service_role;
