create table public.court_observations (
 property_id uuid primary key references public.properties(id) on delete cascade,
 court text not null, case_number text not null, item_number integer not null,
 source_url text not null, observed_at timestamptz not null, payload jsonb not null
);
create table public.collection_runs (
 id uuid primary key default gen_random_uuid(), started_at timestamptz not null default now(),
 finished_at timestamptz, status text not null check(status in ('running','completed','partial','failed')),
 report jsonb not null default '{}'
);
create table public.property_comparisons (
 property_id uuid primary key references public.properties(id) on delete cascade,
 status text not null, reason text not null, rule_version text not null,
 source_url text not null, observed_at timestamptz not null, coverage jsonb not null default '{}',
 target jsonb not null default '{}', trades jsonb not null default '[]'
);
alter table public.court_observations enable row level security;
alter table public.collection_runs enable row level security;
alter table public.property_comparisons enable row level security;
revoke all on public.court_observations, public.collection_runs, public.property_comparisons from anon, authenticated;
grant all on public.court_observations, public.collection_runs, public.property_comparisons to service_role;
grant select on public.property_comparisons to anon, authenticated;
create policy comparisons_read on public.property_comparisons for select to anon, authenticated using (true);
