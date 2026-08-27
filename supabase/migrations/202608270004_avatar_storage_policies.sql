-- Keep event uploads unchanged while restricting avatars to their owner's folder.
drop policy if exists "authenticated upload" on storage.objects;

create policy "authenticated event media upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'event-media' and owner = auth.uid());

create policy "own avatar insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "own avatar update"
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "own avatar delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);
