-- 매물화 신호 per building (scripts/signals/sale-signals.mjs, daily after analyze).
-- Only buildings with at least one signal have a row. signals: [{type, score, label, detail}],
-- strongest first. Wording on screen: "매물화 가능성", never "매도 예정".
create table public.sale_signals (
  place_id text primary key references public.market_places(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  signals jsonb not null,
  refreshed_at timestamptz not null
);
create index sale_signals_score_idx on public.sale_signals (score desc);
alter table public.sale_signals enable row level security;
create policy sale_signals_read on public.sale_signals for select to anon, authenticated using (true);
revoke all on public.sale_signals from anon, authenticated;
grant select on public.sale_signals to anon, authenticated;
