-- Users may edit their public profile fields, never their authorization role.
revoke update on public.profiles from authenticated;
grant update (
  display_name, username, city, latitude, longitude, bio, avatar_path, updated_at
) on public.profiles to authenticated;

drop policy if exists "owner events" on public.events;

create policy "organizers create events"
on public.events for insert to authenticated
with check (
  organizer_id = auth.uid()
  and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('organizer', 'admin')
  )
);

create policy "organizers update events"
on public.events for update to authenticated
using (
  (organizer_id = auth.uid() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('organizer', 'admin')
  )) or public.is_admin()
)
with check (
  (organizer_id = auth.uid() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('organizer', 'admin')
  )) or public.is_admin()
);

create policy "organizers delete events"
on public.events for delete to authenticated
using (
  (organizer_id = auth.uid() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('organizer', 'admin')
  )) or public.is_admin()
);

create or replace function public.create_event_with_artists(
  p_title text,
  p_slug text,
  p_city text,
  p_starts_at timestamptz,
  p_description text default null,
  p_genre text default null,
  p_status public.event_status default 'draft',
  p_artist_names text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_artist_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('organizer', 'admin')
  ) then raise exception 'Organizer role required'; end if;
  if char_length(trim(p_title)) < 3 then raise exception 'Event title is too short'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid event slug'; end if;
  if char_length(trim(p_city)) < 2 then raise exception 'Event city is required'; end if;

  insert into public.events (
    organizer_id, slug, title, description, starts_at, city, genre, status
  ) values (
    auth.uid(), p_slug, trim(p_title), nullif(trim(p_description), ''),
    p_starts_at, trim(p_city), nullif(trim(p_genre), ''), p_status
  ) returning id into v_event_id;

  for v_artist_name in
    select distinct trim(value)
    from unnest(coalesce(p_artist_names, '{}')) as names(value)
    where char_length(trim(value)) >= 2
  loop
    perform public.tag_event_artist(v_event_id, v_artist_name);
  end loop;

  return v_event_id;
end;
$$;

revoke all on function public.create_event_with_artists(
  text, text, text, timestamptz, text, text, public.event_status, text[]
) from public, anon, authenticated;
grant execute on function public.create_event_with_artists(
  text, text, text, timestamptz, text, text, public.event_status, text[]
) to authenticated;
