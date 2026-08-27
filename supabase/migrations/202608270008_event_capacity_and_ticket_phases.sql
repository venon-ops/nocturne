create table public.event_private_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  max_capacity integer not null check (max_capacity > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.event_private_settings enable row level security;

create or replace function public.enforce_event_ticket_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_allocated integer;
begin
  select max_capacity into v_capacity
  from public.event_private_settings where event_id = new.event_id;
  if v_capacity is null then raise exception 'Event maximum capacity is missing'; end if;

  select coalesce(sum(quantity), 0) into v_allocated
  from public.ticket_types
  where event_id = new.event_id and id <> new.id;
  if v_allocated + new.quantity > v_capacity then
    raise exception 'Ticket phases exceed event maximum capacity';
  end if;
  return new;
end;
$$;

create trigger enforce_ticket_capacity
before insert or update of event_id, quantity on public.ticket_types
for each row execute function public.enforce_event_ticket_capacity();

create policy "event owners read private settings"
on public.event_private_settings for select to authenticated
using (public.is_event_owner(event_id) or public.is_admin());

create policy "event owners manage private settings"
on public.event_private_settings for all to authenticated
using (public.is_event_owner(event_id) or public.is_admin())
with check (public.is_event_owner(event_id) or public.is_admin());

drop function if exists public.create_event_with_artists(
  text, text, text, timestamptz, text, text, public.event_status, text[]
);

create or replace function public.create_event_with_artists(
  p_title text,
  p_slug text,
  p_city text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_capacity integer,
  p_ticket_phases jsonb,
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
  v_phase jsonb;
  v_phase_total integer;
  v_phase_name text;
  v_phase_quantity integer;
  v_phase_price_cents integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('organizer', 'admin')
  ) then raise exception 'Organizer role required'; end if;
  if char_length(trim(p_title)) < 3 then raise exception 'Event title is too short'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid event slug'; end if;
  if char_length(trim(p_city)) < 2 then raise exception 'Event city is required'; end if;
  if p_ends_at <= p_starts_at then raise exception 'Event end must be after its start'; end if;
  if p_max_capacity <= 0 then raise exception 'Maximum capacity must be positive'; end if;
  if jsonb_typeof(p_ticket_phases) <> 'array' or jsonb_array_length(p_ticket_phases) = 0 then
    raise exception 'At least one ticket phase is required';
  end if;

  select coalesce(sum((phase->>'quantity')::integer), 0)
  into v_phase_total from jsonb_array_elements(p_ticket_phases) phase;
  if v_phase_total > p_max_capacity then
    raise exception 'Ticket phase capacity exceeds event maximum capacity';
  end if;

  insert into public.events (
    organizer_id, slug, title, description, starts_at, ends_at, city, genre, status
  ) values (
    auth.uid(), p_slug, trim(p_title), nullif(trim(p_description), ''),
    p_starts_at, p_ends_at, trim(p_city), nullif(trim(p_genre), ''), p_status
  ) returning id into v_event_id;

  insert into public.event_private_settings (event_id, max_capacity)
  values (v_event_id, p_max_capacity);

  for v_phase in select value from jsonb_array_elements(p_ticket_phases)
  loop
    v_phase_name := trim(v_phase->>'name');
    v_phase_quantity := (v_phase->>'quantity')::integer;
    v_phase_price_cents := (v_phase->>'price_cents')::integer;
    if char_length(v_phase_name) < 1 or v_phase_quantity <= 0 or v_phase_price_cents < 0 then
      raise exception 'Invalid ticket phase';
    end if;
    insert into public.ticket_types (event_id, name, price_cents, quantity)
    values (v_event_id, v_phase_name, v_phase_price_cents, v_phase_quantity);
  end loop;

  for v_artist_name in
    select distinct trim(value)
    from unnest(coalesce(p_artist_names, '{}')) as names(value)
    where char_length(trim(value)) >= 2
  loop perform public.tag_event_artist(v_event_id, v_artist_name); end loop;

  return v_event_id;
end;
$$;

revoke all on function public.create_event_with_artists(
  text, text, text, timestamptz, timestamptz, integer, jsonb,
  text, text, public.event_status, text[]
) from public, anon, authenticated;
grant execute on function public.create_event_with_artists(
  text, text, text, timestamptz, timestamptz, integer, jsonb,
  text, text, public.event_status, text[]
) to authenticated;
