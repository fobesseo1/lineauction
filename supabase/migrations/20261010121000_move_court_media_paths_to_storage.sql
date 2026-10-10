-- Keep the previous local paths so the move can be reverted.
create table if not exists public.property_media_path_backup (
  id text primary key,
  path text not null,
  backed_up_at timestamptz not null default now()
);
alter table public.property_media_path_backup enable row level security;
revoke all on public.property_media_path_backup from anon, authenticated;

insert into public.property_media_path_backup (id, path)
select id, path from public.property_media where path like '/media/court/%'
on conflict (id) do nothing;

-- Point only rows whose object is confirmed in the public court-media bucket.
update public.property_media m
set path = 'https://ravnmmskkcoojkdipizz.supabase.co/storage/v1/object/public/court-media/' || substr(m.path, 14)
where m.path like '/media/court/%'
  and exists (select 1 from storage.objects o where o.bucket_id = 'court-media' and o.name = substr(m.path, 14));
