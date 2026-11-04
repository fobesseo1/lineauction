-- Data factory on several PCs: whichever PC is on claims the day's job; only one job runs at a time
-- across all PCs, a PC that stops heartbeating loses its lease and another one takes over.
-- Data-factory only (service role); the lineestate web app never reads these.
create table if not exists public.factory_job_leases (
  job text not null,                    -- 'market' | 'onbid' | 'court'
  day date not null,                    -- KST day the run is for
  machine text not null,                -- PC holding (or that last held) the job
  status text not null check (status in ('running', 'completed', 'failed')),
  attempt integer not null default 1,   -- bumped on every takeover or retry
  started_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now(),
  lease_until timestamptz not null,
  finished_at timestamptz,
  previous_machine text,                -- who held it before the last takeover
  bundle_version text,                  -- state bundle uploaded at the end
  summary jsonb,
  primary key (job, day)
);

-- Local state bundles kept in the private storage bucket 'factory-state'. The newest row per bundle
-- is the version every PC must have before running a step that removes rows.
create table if not exists public.factory_bundle_versions (
  bundle text not null,                 -- 'market' | 'onbid' | 'court' | 'shared'
  version text not null,
  machine text not null,
  created_at timestamptz not null default now(),
  baseline boolean not null default false,  -- the first upload; never pruned
  bytes bigint,                         -- compressed bytes uploaded in this version
  total_bytes bigint,                   -- uncompressed size of the state
  manifest_path text not null,
  primary key (bundle, version)
);
create index if not exists factory_bundle_versions_latest_idx on public.factory_bundle_versions (bundle, created_at desc);

-- One Telegram notice per key across all PCs (daily report, missed-job warning).
create table if not exists public.factory_notices (
  key text primary key,
  sent_at timestamptz not null default now(),
  machine text
);

alter table public.factory_job_leases enable row level security;
alter table public.factory_bundle_versions enable row level security;
alter table public.factory_notices enable row level security;
revoke all on public.factory_job_leases, public.factory_bundle_versions, public.factory_notices from anon, authenticated;

-- Claim (job, day) for p_machine. Reasons: 'new' | 'resume' (own earlier run) | 'takeover' (lease
-- expired) | 'retry' (failed earlier) when claimed; 'busy' (another job running elsewhere) |
-- 'held' | 'done' | 'gave-up' (p_max_attempts reached) when not. p_force (a manual start) also
-- reopens a finished or given-up job, but never one another PC is running.
create or replace function public.factory_claim_job(p_job text, p_day date, p_machine text, p_lease_seconds integer, p_max_attempts integer default 3, p_force boolean default false)
 returns jsonb
 language plpgsql
 set search_path to ''
as $function$
declare
  r public.factory_job_leases;
  other public.factory_job_leases;
  lease timestamptz := now() + make_interval(secs => p_lease_seconds);
begin
  perform pg_advisory_xact_lock(hashtext('factory_job_leases'));
  select * into other from public.factory_job_leases
   where status = 'running' and lease_until > now() and machine <> p_machine and not (job = p_job and day = p_day)
   order by started_at limit 1;
  if found then
    return jsonb_build_object('claimed', false, 'reason', 'busy', 'holder', other.machine, 'job', other.job);
  end if;
  insert into public.factory_job_leases (job, day, machine, status, lease_until)
  values (p_job, p_day, p_machine, 'running', lease)
  on conflict (job, day) do nothing
  returning * into r;
  if found then
    return jsonb_build_object('claimed', true, 'reason', 'new', 'attempt', r.attempt);
  end if;
  select * into r from public.factory_job_leases where job = p_job and day = p_day for update;
  if r.status = 'completed' and not p_force then
    return jsonb_build_object('claimed', false, 'reason', 'done', 'holder', r.machine);
  end if;
  if r.status = 'running' and r.lease_until > now() and r.machine <> p_machine then
    return jsonb_build_object('claimed', false, 'reason', 'held', 'holder', r.machine, 'lease_until', r.lease_until);
  end if;
  if r.attempt >= p_max_attempts and not p_force then
    return jsonb_build_object('claimed', false, 'reason', 'gave-up', 'holder', r.machine, 'attempt', r.attempt);
  end if;
  update public.factory_job_leases
     set previous_machine = r.machine, machine = p_machine, status = 'running', attempt = r.attempt + 1,
         started_at = now(), heartbeat_at = now(), lease_until = lease, finished_at = null
   where job = p_job and day = p_day;
  return jsonb_build_object('claimed', true,
    'reason', case when r.status = 'completed' then 'rerun' when r.status = 'failed' then 'retry' when r.machine = p_machine then 'resume' else 'takeover' end,
    'previous', r.machine, 'attempt', r.attempt + 1);
end;
$function$;

-- Extend the lease; false means another PC has taken the job over (stop before writing anything).
create or replace function public.factory_heartbeat(p_job text, p_day date, p_machine text, p_lease_seconds integer)
 returns boolean
 language sql
 set search_path to ''
as $function$
  with u as (
    update public.factory_job_leases
       set heartbeat_at = now(), lease_until = now() + make_interval(secs => p_lease_seconds)
     where job = p_job and day = p_day and machine = p_machine and status = 'running'
    returning 1)
  select exists (select 1 from u);
$function$;

create or replace function public.factory_finish_job(p_job text, p_day date, p_machine text, p_status text, p_summary jsonb, p_bundle_version text)
 returns boolean
 language sql
 set search_path to ''
as $function$
  with u as (
    update public.factory_job_leases
       set status = p_status, finished_at = now(), summary = p_summary, bundle_version = p_bundle_version
     where job = p_job and day = p_day and machine = p_machine and status = 'running'
    returning 1)
  select exists (select 1 from u);
$function$;

revoke execute on function public.factory_claim_job(text, date, text, integer, integer, boolean) from public, anon, authenticated;
revoke execute on function public.factory_heartbeat(text, date, text, integer) from public, anon, authenticated;
revoke execute on function public.factory_finish_job(text, date, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.factory_claim_job(text, date, text, integer, integer, boolean), public.factory_heartbeat(text, date, text, integer), public.factory_finish_job(text, date, text, text, jsonb, text) to service_role;
grant all on public.factory_job_leases, public.factory_bundle_versions, public.factory_notices to service_role;

-- Private bucket for the bundles (service role only; no storage policies are added).
insert into storage.buckets (id, name, public, file_size_limit)
values ('factory-state', 'factory-state', false, 52428800)
on conflict (id) do nothing;
