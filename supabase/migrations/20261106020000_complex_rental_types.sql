-- 임대·혼합 단지 (K-apt 공식 단지기본정보 엑셀, 관리비 공개 의무단지). lineestate reads this to tell rentals apart.
-- Nationwide file, so kapt_code has no foreign key: complexes holds only the regions collected so far.
-- Loaded by scripts/complex/rental-types.mjs; a complex absent from the latest file is not 임대·혼합.
create table public.complex_rental_types (
  kapt_code text primary key,
  sale_type text not null check (sale_type in ('임대','혼합')),
  households integer,
  sale_households integer,
  rental_households integer,
  public_rental integer,
  private_rental integer,
  source_date date not null,             -- K-apt 파일 기준일
  loaded_at timestamptz not null default now()
);
create index complex_rental_types_sale_type on public.complex_rental_types (sale_type);

alter table public.complex_rental_types enable row level security;
create policy complex_rental_types_read on public.complex_rental_types for select to anon, authenticated using (true);
revoke all on public.complex_rental_types from anon, authenticated;
grant select on public.complex_rental_types to anon, authenticated;
