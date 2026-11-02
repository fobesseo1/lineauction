-- Building ↔ K-APT complex links, many-to-many. market_places.kapt_code stays the building's own
-- (first) complex; this table repeats those links and adds the ones K-APT splits across two codes
-- (신당남산타운(분양) and 남산타운 file under one MOLIT lot), so a complex page reads its buildings here.
--   kapt_match : 'pnu' | 'name' | 'near_name' | 'same_point' | 'split'
create table if not exists public.market_place_complexes (
  place_id text not null references public.market_places(id) on delete cascade,
  kapt_code text not null,
  kapt_match text,
  digest text,
  refreshed_at timestamptz not null,
  primary key (place_id, kapt_code)
);
create index if not exists market_place_complexes_kapt_idx on public.market_place_complexes (kapt_code);

-- 아파트 분양권·입주권 전매 (MOLIT RTMSDataSvcSilvTrade), last 12 months. Kept apart from
-- market_trades: a 분양권 price is not a 매매 price of a finished flat.
--   ownership : '분양권' | '입주권' as MOLIT files it
create table if not exists public.market_presale_trades (
  id text primary key,                 -- warehouse key
  kapt_code text,                      -- matched complex, null when K-APT has no such complex yet
  kapt_match text,                     -- 'pnu' | 'name' | 'near_name'
  lawd text not null, sido text, sigungu text, umd text, jibun text, bjd_code text, pnu text,
  name text,
  area numeric, area_type integer, floor integer,
  deal_date date not null,
  amount integer not null,             -- 만원
  ownership text,
  direct boolean not null,             -- 직거래
  cancelled boolean not null           -- 계약 해제 신고됨
);
create index if not exists market_presale_trades_kapt_idx on public.market_presale_trades (kapt_code, area_type, deal_date desc);
create index if not exists market_presale_trades_area_idx on public.market_presale_trades (lawd, umd);
create index if not exists market_presale_trades_date_idx on public.market_presale_trades (deal_date);

alter table public.market_place_complexes enable row level security;
alter table public.market_presale_trades enable row level security;
create policy market_place_complexes_read on public.market_place_complexes for select to anon, authenticated using (true);
create policy market_presale_trades_read on public.market_presale_trades for select to anon, authenticated using (true);
revoke all on public.market_place_complexes, public.market_presale_trades from anon, authenticated;
grant select on public.market_place_complexes, public.market_presale_trades to anon, authenticated;
