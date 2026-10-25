-- K-APT 상세정보의 부대·복리시설 (lineestate 전세·월세 "주거 편의" 점수용).
-- welfareFacility is a fixed checklist (관리사무소, 노인정, 보육시설, 문고, 주민공동시설, 어린이놀이터,
-- 휴게시설, 커뮤니티공간, 자전거보관소, 유치원, 기타) — it never names 피트니스/수영장 etc.
-- convenientFacility / educationFacility are free text like "병원(서울숭인병원) 공원(숭인근린공)".
alter table public.complexes
  add column welfare_facilities text[],
  add column convenience_facilities text,
  add column education_facilities text;

grant select (welfare_facilities, convenience_facilities, education_facilities)
  on public.complexes to anon, authenticated;
