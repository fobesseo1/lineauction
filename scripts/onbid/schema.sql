create table if not exists public.onbid_observations (
 property_id uuid primary key references public.properties(id) on delete cascade,
 observed_at timestamptz not null,
 list_payload jsonb not null default '{}',
 detail_payload jsonb,
 detail_status text not null default 'pending',
 documents jsonb not null default '[]',
 photos jsonb not null default '[]'
);
alter table public.onbid_observations enable row level security;
revoke all on public.onbid_observations from anon, authenticated;
grant all on public.onbid_observations to service_role;
-- Raw API payload remains server-only. Render selected public property fields on the server.
