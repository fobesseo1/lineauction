-- Cost-approach constants for the price calculator (applied with execute_sql; kept here as record).
-- Source: 행정안전부 2026년 지방세 시가표준액 조사·산정 업무요령 — 구조지수표, 잔가율표, 용도지수표.
-- Structures are matched against 건축물대장 주구조 in array order (specific names first).
-- 잔가율 = max(1 − rate × 경과연수, 0.10). Use index: 아파트 = 1.00, so
-- 건축비/㎡ = build_cost.apartment × 구조지수 × 용도지수.
insert into public.calc_constants (key, value, unit, as_of, source, source_url, note) values
('cost.structure', '[
 {"group":"철골(철골철근)콘크리트조","match":["철골철근콘크리트","철골콘크리트"],"index":1.20,"life":50,"rate":0.018},
 {"group":"통나무조","match":["통나무"],"index":1.35,"life":50,"rate":0.018},
 {"group":"경량철골조","match":["경량철골"],"index":0.65,"life":20,"rate":0.045},
 {"group":"보강콘크리트·보강블록조","match":["보강콘크리트","보강블록","보강블럭"],"index":0.95,"life":30,"rate":0.030},
 {"group":"흙벽돌·토담·철파이프·컨테이너","match":["흙","토담","돌담","파이프","컨테이너"],"index":0.30,"life":10,"rate":0.090},
 {"group":"황토·ALC·시멘트벽돌조","match":["황토","ALC","시멘트벽돌"],"index":0.90,"life":30,"rate":0.030},
 {"group":"조립식·FRP 패널조","match":["패널","판넬"],"index":0.55,"life":20,"rate":0.045},
 {"group":"시멘트블록조","match":["블록","블럭"],"index":0.60,"life":20,"rate":0.045},
 {"group":"철근콘크리트조·라멘조·석조·프리캐스트","match":["철근콘크리트","라멘","석구조","석조","프리캐스트","프리케스트","콘크리트구조"],"index":1.00,"life":40,"rate":0.0225},
 {"group":"목조","match":["일반목","목조"],"index":0.83,"life":30,"rate":0.030},
 {"group":"목구조","match":["목구조"],"index":1.25,"life":40,"rate":0.0225},
 {"group":"철골조·스틸하우스조","match":["철골","스틸하우스","강구조"],"index":1.00,"life":30,"rate":0.030},
 {"group":"연와조(벽돌)","match":["벽돌","연와","조적"],"index":1.00,"life":30,"rate":0.030}
]', '지수·년·연간상각률', '2026-01-01', '행정안전부 2026년 지방세 시가표준액 조사·산정 업무요령 (구조지수표, 잔가율표)',
 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000012&nttId=123083',
 '건축물대장 주구조(parcel_info.structure)를 배열 순서대로 match 단어로 찾는다(구체적인 이름이 앞에 있음). 잔가율 = max(1 − rate × 경과연수, 0.10). 못 찾으면 철근콘크리트조로 보고 사용자가 고르게 한다'),
('cost.use_index', '{"아파트":1.00,"연립·다세대":0.91,"단독·다중·다가구":0.91,"도시형생활주택":0.91,"주거용 오피스텔":1.23,"사무용 오피스텔":1.08,"상점·음식점 등 근린생활시설":1.12,"대형마트·백화점":1.29,"시장":1.05,"의원·한의원":1.12,"일반병원":1.20,"사무실 건물":1.12,"여관·모텔":1.20,"호텔(일반)":1.24,"노래연습장 등":1.12,"공장":0.80,"지식산업센터":1.00,"창고":0.80,"물류창고":0.85,"주차장":0.71}', '지수', '2026-01-01',
 '행정안전부 2026년 지방세 시가표준액 조사·산정 업무요령 (용도지수표)',
 'https://www.mois.go.kr/frt/bbs/type001/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000012&nttId=123083',
 '아파트 = 1.00 기준. 건축비 = build_cost.apartment × 구조지수 × 용도지수 로 쓰면 아파트 철근콘크리트가 기본형건축비와 같아진다')
on conflict (key) do update set value=excluded.value, unit=excluded.unit, as_of=excluded.as_of, source=excluded.source,
  source_url=excluded.source_url, note=excluded.note, updated_at=now();
