-- Public, whitelisted view of one Onbid observation. The raw list/detail payloads stay
-- private (onbid_observations has RLS and no policies); this exposes only display fields
-- plus official photo/document links, for the read-only public site.
create or replace function public.onbid_public_detail(p_property_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'observed_at', o.observed_at,
    'detail_status', o.detail_status,
    'fields', jsonb_strip_nulls(jsonb_build_object(
      'orgNm', p->>'orgNm',
      'evcRsbyTrgtCont', p->>'evcRsbyTrgtCont',
      'cptnMthodNm', p->>'cptnMthodNm',
      'bidMthodNm', p->>'bidMthodNm',
      'cltrRadr', p->>'cltrRadr',
      'zadrNm', p->>'zadrNm',
      'utlzPscdCont', p->>'utlzPscdCont',
      'icdlCdtnCont', p->>'icdlCdtnCont',
      'pytnMtrsCont', p->>'pytnMtrsCont',
      'dsplVldCont', p->>'dsplVldCont',
      'cltrEtcCont', p->>'cltrEtcCont',
      'thnlImgUrlAdr', p->>'thnlImgUrlAdr'
    )),
    'photos', (select coalesce(jsonb_agg(jsonb_build_object('url', e->>'url', 'kind', e->>'kind')), '[]'::jsonb)
               from jsonb_array_elements(case when jsonb_typeof(o.photos) = 'array' then o.photos else '[]'::jsonb end) e),
    'documents', (select coalesce(jsonb_agg(jsonb_build_object('title', e->>'title', 'url', e->>'url')), '[]'::jsonb)
                  from jsonb_array_elements(case when jsonb_typeof(o.documents) = 'array' then o.documents else '[]'::jsonb end) e)
  )
  from public.onbid_observations o
  cross join lateral (select coalesce(o.list_payload, '{}'::jsonb) || coalesce(o.detail_payload, '{}'::jsonb) as p) merged
  where o.property_id = p_property_id;
$$;
revoke all on function public.onbid_public_detail(uuid) from public;
grant execute on function public.onbid_public_detail(uuid) to anon, authenticated;
