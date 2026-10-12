-- Onbid writes the PNU land-type digit as 0 = regular, 1 = 산; convert stored rows to the national
-- standard (1 = regular, 2 = 산) used by vworld, the building register and court PNUs.
-- New rows are converted in scripts/onbid/core.mjs (standardPnu).
update public.properties
set pnu = left(pnu,10) || case substring(pnu,11,1) when '0' then '1' when '1' then '2' end || right(pnu,8)
where source = 'onbid' and pnu ~ '^\d{19}$' and substring(pnu,11,1) in ('0','1');
