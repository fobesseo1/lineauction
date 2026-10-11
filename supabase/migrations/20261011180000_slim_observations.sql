-- Keep the free-tier DB small: full API responses live in the local raw caches
-- (data/court, data/onbid, data/complex) and in the export at data/db-backup/2026-10-11.
-- Applied 2026-10-11 via SQL, followed by VACUUM FULL on the three tables (394MB → 214MB).
update public.court_observations set payload = '{}'::jsonb where payload <> '{}'::jsonb;

-- Onbid keeps only the fields read back by onbid_public_detail and cover publishing
-- (scripts/onbid/core.mjs DISPLAY_FIELDS).
update public.onbid_observations set
  list_payload = (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(list_payload) e(k, v)
                  where k = any (array['orgNm','evcRsbyTrgtCont','cptnMthodNm','bidMthodNm','cltrRadr','zadrNm','utlzPscdCont','icdlCdtnCont','pytnMtrsCont','dsplVldCont','cltrEtcCont','thnlImgUrlAdr'])),
  detail_payload = case when detail_payload is null then null else
                  (select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from jsonb_each(detail_payload) e(k, v)
                  where k = any (array['orgNm','evcRsbyTrgtCont','cptnMthodNm','bidMthodNm','cltrRadr','zadrNm','utlzPscdCont','icdlCdtnCont','pytnMtrsCont','dsplVldCont','cltrEtcCont','thnlImgUrlAdr'])) end;

update public.complexes set basis_raw = null, detail_raw = null where basis_raw is not null or detail_raw is not null;

-- Old local photo paths from the move to Storage; exported to the local backup.
drop table public.property_media_path_backup;
