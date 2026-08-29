create policy "mark own notifications read"
on public.notifications for update
using(profile_id=auth.uid())
with check(profile_id=auth.uid());

create index if not exists notifications_profile_unread_idx
on public.notifications(profile_id,created_at desc)
where read_at is null;
