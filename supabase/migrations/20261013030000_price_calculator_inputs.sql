-- Inputs for the "가격 계산해보기" calculator (comparison, cost and income approaches).
--   market_area_stats: 월세 보증금·월세 medians (만원) per building + 평형, for the income approach.
--   parcel_info.structure: 주구조 from the building register (건축HUB 표제부), for the cost approach.
--   calc_constants: small published constants (construction costs, rates) with their source.
alter table public.market_area_stats
  add column wolse_deposit_median integer,
  add column wolse_rent_median integer;

alter table public.parcel_info add column structure text;  -- 주구조, e.g. 철근콘크리트구조

create table public.calc_constants (
  key text primary key,        -- e.g. build_cost.apartment, build_cost.tax_standard
  value jsonb not null,        -- a number or a {label: number} map
  unit text not null,          -- 원/㎡, %, 년 …
  as_of date not null,         -- when the source published it
  source text not null,        -- who published it (shown to users)
  source_url text,
  note text,
  updated_at timestamptz not null default now()
);
alter table public.calc_constants enable row level security;
create policy calc_constants_read on public.calc_constants for select to anon, authenticated using (true);
revoke all on public.calc_constants from anon, authenticated;
grant select on public.calc_constants to anon, authenticated;

insert into public.calc_constants (key, value, unit, as_of, source, source_url, note) values
 ('build_cost.apartment', '2328000', '원/㎡', '2026-09-15', '국토교통부 기본형건축비 고시',
  'https://www.molit.go.kr/USR/I0204/m_45/dtl.jsp?idx=18905',
  '분양가상한제 공동주택 16~25층, 전용 60~85㎡ 지상층 기준. 실제 공사비에 가장 가까운 공개 단가'),
 ('build_cost.tax_standard', '{"주거용":860000,"상업용":860000,"공업용":840000,"농수산용":640000,"문화·복지·교육용":860000,"공공용":850000}', '원/㎡', '2026-01-01',
  '행정안전부 2026년 건물신축가격기준액 고시', 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000012&nttId=123083',
  '지방세 시가표준액용 단가. 실제 공사비보다 낮으므로 하한 참고용');
