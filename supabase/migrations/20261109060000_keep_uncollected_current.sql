-- Since 2026-11-08 only apartments are collected. Other court types no longer get last_seen_at updates,
-- so the 4-day "missing from the list" rule would end every one of them. They keep their stored
-- is_current instead; only collected apartments can leave the current list that way.
-- Onbid rows are unchanged: their current round follows the bid dates, and only apartments can be closed.
create or replace function public.refresh_current_rounds()
 returns integer
 language sql
 set search_path to ''
as $function$
  with closed as (
    select property_id from public.property_lifecycle where state = 'closed'
  ), withdrawn as (
    select p.source_property_id, max(l.checked_at) as at
    from public.properties p join public.property_lifecycle l on l.property_id = p.id
    where p.source = 'onbid' and l.state = 'closed' and p.bid_end_at >= now()
    group by p.source_property_id
  ), cur as (
    select distinct on (p.source_property_id) p.id
    from public.properties p
    where p.source = 'onbid' and p.bid_end_at >= now() and p.id not in (select property_id from closed)
      and not exists (select 1 from withdrawn w where w.source_property_id = p.source_property_id and p.last_seen_at <= w.at)
    order by p.source_property_id, p.bid_end_at, p.auction_condition_id
  ), court_run as (
    select max(last_seen_at) as at from public.properties where source = 'court'
  ), next_state as (
    select p.id, case when p.source = 'court' and p.usage_type is distinct from '아파트' then p.is_current
                      when p.source = 'court' then p.id not in (select property_id from closed)
                        and not coalesce(p.sale_date::date >= (now() at time zone 'Asia/Seoul')::date
                                 and p.last_seen_at < (select at from court_run) - interval '4 days', false)
                      else p.id in (select id from cur) end as current
    from public.properties p
  ), changed as (
    update public.properties p set is_current = n.current
    from next_state n where n.id = p.id and p.is_current is distinct from n.current
    returning 1
  )
  select count(*)::integer from changed;
$function$;
