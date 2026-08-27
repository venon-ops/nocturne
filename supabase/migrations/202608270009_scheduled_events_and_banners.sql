alter table public.events
  add column if not exists publish_at timestamptz;

alter table public.events
  add constraint events_publish_at_requires_draft
  check (publish_at is null or status = 'draft');

drop policy if exists "public events" on public.events;
create policy "public and due events"
on public.events for select
using (
  status = 'published'
  or (status = 'draft' and publish_at <= now())
  or organizer_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "public types" on public.ticket_types;
create policy "public types"
on public.ticket_types for select
using (
  exists (
    select 1 from public.events e
    where e.id = event_id
      and (
        e.status = 'published'
        or (e.status = 'draft' and e.publish_at <= now())
        or e.organizer_id = auth.uid()
        or public.is_admin()
      )
  )
);

create or replace function public.schedule_event_publication(
  p_event_id uuid,
  p_publish_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_publish_at <= now() then raise exception 'Publication date must be in the future'; end if;
  if not exists (
    select 1 from public.events
    where id = p_event_id and (organizer_id = auth.uid() or public.is_admin())
  ) then raise exception 'Event not found or forbidden'; end if;

  update public.events
  set status = 'draft', publish_at = p_publish_at
  where id = p_event_id;
end;
$$;

create or replace function public.set_event_banner(p_event_id uuid, p_cover_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if split_part(p_cover_path, '/', 1) <> auth.uid()::text then
    raise exception 'Invalid banner path';
  end if;
  update public.events set cover_path = p_cover_path
  where id = p_event_id and (organizer_id = auth.uid() or public.is_admin());
  if not found then raise exception 'Event not found or forbidden'; end if;
end;
$$;

revoke all on function public.schedule_event_publication(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.schedule_event_publication(uuid, timestamptz) to authenticated;
revoke all on function public.set_event_banner(uuid, text) from public, anon, authenticated;
grant execute on function public.set_event_banner(uuid, text) to authenticated;

drop policy if exists "authenticated event media upload" on storage.objects;
create policy "own event media insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-media'
  and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "own event media update"
on storage.objects for update to authenticated
using (
  bucket_id = 'event-media' and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'event-media' and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "own event media delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'event-media' and owner = auth.uid()
  and (storage.foldername(name))[1] = auth.uid()::text
);
