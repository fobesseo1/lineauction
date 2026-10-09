create table public.property_lifecycle (
 property_id uuid primary key references public.properties(id) on delete cascade,
 state text not null check (state in ('observed','needs-recheck','needs-review','closed')),
 reason text not null, checked_at timestamptz not null, source_url text not null,
 evidence jsonb not null default '{}'
);
create table public.property_lifecycle_history (
 id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
 state text not null, reason text not null, checked_at timestamptz not null, source_url text not null, evidence jsonb not null
);
create function public.capture_lifecycle_history() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' or (new.state,new.reason) is distinct from (old.state,old.reason) then
 insert into public.property_lifecycle_history(property_id,state,reason,checked_at,source_url,evidence)
 values(new.property_id,new.state,new.reason,new.checked_at,new.source_url,new.evidence);
 end if;
 return new;
end;$$;
create trigger lifecycle_history after insert or update on public.property_lifecycle for each row execute function public.capture_lifecycle_history();
create table public.property_media (
 id text primary key, property_id uuid not null references public.properties(id) on delete cascade,
 path text not null, source_url text not null, observed_at timestamptz not null,
 width integer not null, height integer not null, bytes integer not null, original_bytes integer not null
);
create index property_media_property_idx on public.property_media(property_id);
create index lifecycle_history_property_idx on public.property_lifecycle_history(property_id,checked_at desc);
alter table public.property_lifecycle enable row level security;
alter table public.property_lifecycle_history enable row level security;
alter table public.property_media enable row level security;
revoke all on public.property_lifecycle,public.property_lifecycle_history,public.property_media from anon,authenticated;
grant all on public.property_lifecycle,public.property_lifecycle_history,public.property_media to service_role;
grant select on public.property_lifecycle,public.property_lifecycle_history,public.property_media to anon,authenticated;
create policy lifecycle_read on public.property_lifecycle for select to anon,authenticated using(true);
create policy lifecycle_history_read on public.property_lifecycle_history for select to anon,authenticated using(true);
create policy media_read on public.property_media for select to anon,authenticated using(true);
create function public.upsert_court_batch(p_items jsonb) returns jsonb language plpgsql set search_path='' as $$
declare entry jsonb; outcome text; results jsonb:='[]';
begin
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>500 then raise exception 'Invalid batch'; end if;
 for entry in select value from jsonb_array_elements(p_items) loop
  outcome:=public.upsert_auction_property(entry->'input',(entry->>'checkedAt')::timestamptz);
  results:=results||jsonb_build_array(jsonb_build_object('key',entry->>'key','outcome',outcome));
 end loop;
 return results;
end;$$;
revoke all on function public.upsert_court_batch(jsonb) from public,anon,authenticated;
grant execute on function public.upsert_court_batch(jsonb) to service_role;

create view public.properties_catalog with(security_invoker=true) as
 select p.*, l.state lifecycle_state,l.reason lifecycle_reason,l.checked_at lifecycle_checked_at,m.path cover_image
 from public.properties_public p
 left join public.property_lifecycle l on l.property_id=p.id
 left join lateral(select path from public.property_media where property_id=p.id order by id limit 1)m on true;
grant select on public.properties_catalog to anon,authenticated,service_role;

create function public.guard_lifecycle_observation() returns trigger language plpgsql set search_path='' as $$
begin
 if new.checked_at < old.checked_at then return old; end if;
 return new;
end;$$;
create trigger lifecycle_monotonic before update on public.property_lifecycle for each row execute function public.guard_lifecycle_observation();

alter table public.property_media add column alt text not null default '법원 공개 사진', add column sort_order integer not null default 0;
create or replace view public.properties_catalog with(security_invoker=true) as select p.*,l.state lifecycle_state,l.reason lifecycle_reason,l.checked_at lifecycle_checked_at,m.path cover_image from public.properties_public p left join public.property_lifecycle l on l.property_id=p.id left join lateral(select path from public.property_media where property_id=p.id order by sort_order,id limit 1)m on true;
