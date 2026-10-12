-- 36-month chart data per building+평형 (scripts/molit/publish.mjs, monthlyHistory), stored sparsely:
--   {"from":"2023-11","sale":"0:201000:3,1:192500:5","jeonse":"2:110000:4"}
-- Each entry: <month index from "from">:<median 만원>:<count>. Months without trades are left out;
-- cancelled and 직거래 sales are excluded. (A dense 36-slot array was tried first and cost ~100MB.)
alter table public.market_area_stats add column history jsonb;
