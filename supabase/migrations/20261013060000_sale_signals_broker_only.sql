-- 매물화 신호 details are a broker feature: the full table (with the reasons) is readable only by
-- approved brokers (app.broker_verifications) and admins. A public summary keeps score and signal
-- names so the site can show the top of the list and the badge on building pages to everyone.
create or replace function public.is_verified_broker() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.broker_verifications b where b.user_id = auth.uid() and b.status = 'approved')
      or exists (select 1 from app.admins a where a.user_id = auth.uid());
$$;
revoke all on function public.is_verified_broker() from public, anon;
grant execute on function public.is_verified_broker() to authenticated;

drop policy sale_signals_read on public.sale_signals;
revoke all on public.sale_signals from anon, authenticated;
grant select on public.sale_signals to authenticated;
create policy sale_signals_broker_read on public.sale_signals for select to authenticated using (public.is_verified_broker());

create table public.sale_signal_summary (
  place_id text primary key references public.market_places(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  types text[] not null,     -- auction · surge · move-in-2y · move-in-4y, strongest first
  labels text[] not null,    -- 신호 이름 (경매·공매 진행 중, 거래 급증 …), no reasons
  refreshed_at timestamptz not null
);
create index sale_signal_summary_score_idx on public.sale_signal_summary (score desc);
alter table public.sale_signal_summary enable row level security;
create policy sale_signal_summary_read on public.sale_signal_summary for select to anon, authenticated using (true);
revoke all on public.sale_signal_summary from anon, authenticated;
grant select on public.sale_signal_summary to anon, authenticated;
