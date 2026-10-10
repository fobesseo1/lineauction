-- Public read-only bucket for court photos. Public buckets serve objects by URL without
-- RLS; no storage.objects policies are added, so anon/authenticated keys cannot list,
-- upload, update or delete. Only the server secret key (bypasses RLS) can write.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('court-media', 'court-media', true, 2097152, array['image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
