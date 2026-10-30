-- Withdrawn, suspended or rescheduled items leave the current listing sooner.
--   onbid: a round the lifecycle closed (unseen in the list two days running) is no longer current,
--          even if its bid_end_at is still ahead, and neither are the item's later rounds unless
--          they were seen in the list after that.
--   court: an upcoming item missing from the daily list for 4+ days before the latest list run
--          (취하·정지·변경 drop it from the list) is no longer current. Anchoring on the latest run
--          keeps everything current when the collector itself has not run.
create or replace function public.refresh_current_rounds()
 returns integer
 language sql
 set search_path to ''
as $function$
  with closed as (
    select property_id from public.property_lifecycle where state = 'closed'
  ), withdrawn as (
    -- An item whose round closed before its bid end; its later rounds count only if seen since.
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
    select p.id, case when p.source = 'court' then p.id not in (select property_id from closed)
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
