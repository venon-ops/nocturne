create extension if not exists unaccent;

create type public.artist_page_status as enum (
  'auto_created',
  'claim_pending',
  'claimed',
  'verified',
  'rejected'
);

create type public.artist_claim_type as enum ('artist', 'representative', 'organizer');
create type public.artist_claim_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.artist_manager_role as enum ('owner', 'representative', 'organizer', 'editor');

create table public.artist_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  normalized_name text not null unique,
  display_name text not null check (char_length(display_name) between 1 and 100),
  bio text check (char_length(bio) <= 2000),
  avatar_path text,
  status public.artist_page_status not null default 'auto_created',
  claimed_profile_id uuid references public.profiles(id) on delete set null,
  signal_event_count integer not null default 0 check (signal_event_count >= 0),
  signal_organizer_count integer not null default 0 check (signal_organizer_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.artist_name_mentions (
  event_id uuid not null references public.events(id) on delete cascade,
  normalized_name text not null,
  submitted_name text not null check (char_length(submitted_name) between 1 and 100),
  tagged_by uuid not null references public.profiles(id) on delete cascade,
  artist_page_id uuid references public.artist_pages(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, normalized_name)
);

create table public.artist_page_claims (
  id uuid primary key default gen_random_uuid(),
  artist_page_id uuid not null references public.artist_pages(id) on delete cascade,
  claimant_profile_id uuid not null references public.profiles(id) on delete cascade,
  claim_type public.artist_claim_type not null,
  message text check (char_length(message) <= 2000),
  evidence_url text check (
    char_length(evidence_url) <= 500
    and evidence_url ~* '^https?://'
  ),
  status public.artist_claim_status not null default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index artist_page_claims_one_pending_per_user
  on public.artist_page_claims (artist_page_id, claimant_profile_id)
  where status = 'pending';

create table public.artist_page_managers (
  artist_page_id uuid not null references public.artist_pages(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.artist_manager_role not null,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (artist_page_id, profile_id)
);

alter table public.event_artists
  add column if not exists artist_page_id uuid references public.artist_pages(id) on delete cascade;

create unique index event_artists_event_artist_page_unique
  on public.event_artists (event_id, artist_page_id)
  where artist_page_id is not null;

create or replace function public.normalize_artist_name(p_name text)
returns text
language sql
immutable
strict
set search_path = public, extensions
as $$
  select trim(regexp_replace(lower(unaccent(p_name)), '[^a-z0-9]+', ' ', 'g'));
$$;

create or replace function public.artist_slug(p_normalized_name text)
returns text
language sql
immutable
strict
set search_path = public
as $$
  select trim(both '-' from regexp_replace(p_normalized_name, '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.refresh_artist_page(p_normalized_name text, p_force boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page_id uuid;
  v_display_name text;
  v_event_count integer;
  v_organizer_count integer;
  v_slug text;
begin
  select
    min(m.submitted_name),
    count(distinct m.event_id) filter (where e.status = 'published'),
    count(distinct e.organizer_id) filter (where e.status = 'published')
  into v_display_name, v_event_count, v_organizer_count
  from public.artist_name_mentions m
  join public.events e on e.id = m.event_id
  where m.normalized_name = p_normalized_name;

  select id into v_page_id
  from public.artist_pages
  where normalized_name = p_normalized_name;

  if v_page_id is null and (p_force or v_event_count >= 3 or v_organizer_count >= 2) then
    v_slug := public.artist_slug(p_normalized_name);
    if exists (select 1 from public.artist_pages where slug = v_slug) then
      v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 6);
    end if;

    insert into public.artist_pages (
      slug, normalized_name, display_name, signal_event_count, signal_organizer_count
    ) values (
      v_slug, p_normalized_name, coalesce(v_display_name, p_normalized_name),
      coalesce(v_event_count, 0), coalesce(v_organizer_count, 0)
    )
    returning id into v_page_id;
  elsif v_page_id is not null then
    update public.artist_pages
    set signal_event_count = coalesce(v_event_count, 0),
        signal_organizer_count = coalesce(v_organizer_count, 0),
        updated_at = now()
    where id = v_page_id;
  end if;

  if v_page_id is not null then
    update public.artist_name_mentions
    set artist_page_id = v_page_id
    where normalized_name = p_normalized_name
      and artist_page_id is distinct from v_page_id;
  end if;

  return v_page_id;
end;
$$;

create or replace function public.tag_event_artist(p_event_id uuid, p_artist_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text;
  v_page_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.events
    where id = p_event_id and (organizer_id = auth.uid() or public.is_admin())
  ) then raise exception 'Not allowed to edit this event'; end if;

  v_normalized := public.normalize_artist_name(p_artist_name);
  if char_length(v_normalized) < 2 then raise exception 'Artist name is too short'; end if;

  insert into public.artist_name_mentions (event_id, normalized_name, submitted_name, tagged_by)
  values (p_event_id, v_normalized, trim(p_artist_name), auth.uid())
  on conflict (event_id, normalized_name)
  do update set submitted_name = excluded.submitted_name, tagged_by = auth.uid();

  v_page_id := public.refresh_artist_page(v_normalized);
  return v_page_id;
end;
$$;

create or replace function public.request_artist_page_claim(
  p_artist_name text,
  p_claim_type public.artist_claim_type,
  p_message text default null,
  p_evidence_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized text;
  v_page_id uuid;
  v_claim_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  v_normalized := public.normalize_artist_name(p_artist_name);
  if char_length(v_normalized) < 2 then raise exception 'Artist name is too short'; end if;

  v_page_id := public.refresh_artist_page(v_normalized, true);
  if v_page_id is null then
    insert into public.artist_pages (slug, normalized_name, display_name, status)
    values (public.artist_slug(v_normalized), v_normalized, trim(p_artist_name), 'claim_pending')
    returning id into v_page_id;
  else
    update public.artist_pages
    set display_name = case when status = 'auto_created' then trim(p_artist_name) else display_name end,
        status = case when status = 'auto_created' then 'claim_pending' else status end,
        updated_at = now()
    where id = v_page_id;
  end if;

  insert into public.artist_page_claims (
    artist_page_id, claimant_profile_id, claim_type, message, evidence_url
  ) values (
    v_page_id, auth.uid(), p_claim_type, nullif(trim(p_message), ''), nullif(trim(p_evidence_url), '')
  ) returning id into v_claim_id;

  return v_claim_id;
end;
$$;

create or replace function public.review_artist_page_claim(p_claim_id uuid, p_approved boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim public.artist_page_claims%rowtype;
  v_role public.artist_manager_role;
begin
  if not public.is_admin() then raise exception 'Admin required'; end if;
  select * into v_claim from public.artist_page_claims where id = p_claim_id for update;
  if not found or v_claim.status <> 'pending' then raise exception 'Pending claim not found'; end if;

  update public.artist_page_claims
  set status = case when p_approved then 'approved' else 'rejected' end,
      reviewed_by = auth.uid(), reviewed_at = now()
  where id = p_claim_id;

  if p_approved then
    v_role := case v_claim.claim_type
      when 'artist' then 'owner'::public.artist_manager_role
      when 'representative' then 'representative'::public.artist_manager_role
      else 'organizer'::public.artist_manager_role
    end;

    insert into public.artist_page_managers (artist_page_id, profile_id, role, granted_by)
    values (v_claim.artist_page_id, v_claim.claimant_profile_id, v_role, auth.uid())
    on conflict (artist_page_id, profile_id) do update set role = excluded.role, granted_by = auth.uid();

    update public.artist_pages
    set status = case when v_claim.claim_type = 'artist' then 'verified' else 'claimed' end,
        claimed_profile_id = case when v_claim.claim_type = 'artist' then v_claim.claimant_profile_id else claimed_profile_id end,
        updated_at = now()
    where id = v_claim.artist_page_id;

    if v_claim.claim_type = 'artist' then
      update public.profiles set role = 'artist_verified' where id = v_claim.claimant_profile_id;
    end if;
  end if;
end;
$$;

create or replace function public.refresh_event_artist_signals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  for v_name in select normalized_name from public.artist_name_mentions where event_id = new.id
  loop perform public.refresh_artist_page(v_name); end loop;
  return new;
end;
$$;

create trigger refresh_artist_signals_on_event_status
after update of status on public.events
for each row when (old.status is distinct from new.status)
execute function public.refresh_event_artist_signals();

-- Preserve artist pages already backed by a verified account.
insert into public.artist_pages (
  slug, normalized_name, display_name, bio, status, claimed_profile_id
)
select
  public.artist_slug(public.normalize_artist_name(ap.handle)),
  public.normalize_artist_name(ap.handle),
  coalesce(nullif(p.display_name, ''), ap.handle),
  coalesce(p.bio, ap.bio),
  'verified',
  p.id
from public.artist_profiles ap
join public.profiles p on p.id = ap.profile_id
where p.role = 'artist_verified'
on conflict do nothing;

insert into public.artist_page_managers (artist_page_id, profile_id, role, granted_by)
select page.id, page.claimed_profile_id, 'owner', page.claimed_profile_id
from public.artist_pages page
where page.claimed_profile_id is not null
on conflict (artist_page_id, profile_id) do nothing;

alter table public.artist_pages enable row level security;
alter table public.artist_name_mentions enable row level security;
alter table public.artist_page_claims enable row level security;
alter table public.artist_page_managers enable row level security;

create policy "artist pages are public" on public.artist_pages for select using (status <> 'rejected');
create policy "published artist mentions are public" on public.artist_name_mentions for select using (
  exists (select 1 from public.events where events.id = event_id and events.status = 'published')
  or tagged_by = auth.uid()
  or public.is_admin()
);
create policy "own claims are visible" on public.artist_page_claims for select using (
  claimant_profile_id = auth.uid() or public.is_admin()
);
create policy "managers are visible" on public.artist_page_managers for select using (true);
create policy "managers update artist pages" on public.artist_pages for update using (
  exists (
    select 1 from public.artist_page_managers
    where artist_page_id = artist_pages.id and profile_id = auth.uid()
  ) or public.is_admin()
) with check (
  exists (
    select 1 from public.artist_page_managers
    where artist_page_id = artist_pages.id and profile_id = auth.uid()
  ) or public.is_admin()
);

revoke update on public.artist_pages from authenticated;
grant update (display_name, bio, avatar_path, updated_at) on public.artist_pages to authenticated;

grant execute on function public.tag_event_artist(uuid, text) to authenticated;
grant execute on function public.request_artist_page_claim(text, public.artist_claim_type, text, text) to authenticated;
revoke all on function public.refresh_artist_page(text, boolean) from public, anon, authenticated;
revoke all on function public.refresh_event_artist_signals() from public, anon, authenticated;
revoke all on function public.review_artist_page_claim(uuid, boolean) from public, anon, authenticated;
grant execute on function public.review_artist_page_claim(uuid, boolean) to authenticated;
