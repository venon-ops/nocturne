drop policy if exists "own follows" on public.artist_follows;

create policy "follow verified artists"
on public.artist_follows for insert to authenticated
with check (
  follower_id = auth.uid()
  and follower_id <> artist_id
  and exists (
    select 1
    from public.profiles
    where profiles.id = artist_id
      and profiles.role = 'artist_verified'
  )
);

create policy "unfollow artists"
on public.artist_follows for delete to authenticated
using (follower_id = auth.uid());
