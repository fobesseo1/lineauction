-- Onbid lists every scheduled round of one 물건 as its own condition row (each round's minimum
-- drops ~10%). is_current marks the row a person can actually bid on now: for Onbid the earliest
-- round whose bidding has not ended, per 물건관리번호; court rows are one per 물건 and always current.
-- Screens should list only is_current rows; discounts are computed only for them.
alter table public.properties add column is_current boolean;
create index properties_current_idx on public.properties (is_current) where is_current;

create or replace function public.refresh_current_rounds() returns integer
language sql security invoker set search_path = '' as $$
  with cur as (
    select distinct on (source_property_id) id
    from public.properties
    where source = 'onbid' and bid_end_at >= now()
    order by source_property_id, bid_end_at, auction_condition_id
  ), next_state as (
    select p.id, (p.source = 'court' or p.id in (select id from cur)) as current
    from public.properties p
  ), changed as (
    update public.properties p set is_current = n.current
    from next_state n where n.id = p.id and p.is_current is distinct from n.current
    returning 1
  )
  select count(*)::integer from changed;
$$;
revoke all on function public.refresh_current_rounds() from public, anon, authenticated;
grant execute on function public.refresh_current_rounds() to service_role;
select public.refresh_current_rounds();
