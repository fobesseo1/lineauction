-- Daily snapshot of 매물화 신호, kept to check later whether signalled buildings really came to market
-- (compare with new auctions and sales after the signal day). Not exposed to the API roles.
create table public.sale_signal_history (
  day date not null,
  place_id text not null,
  score integer not null,
  types text[] not null,
  primary key (day, place_id)
);
alter table public.sale_signal_history enable row level security;
revoke all on public.sale_signal_history from anon, authenticated;
