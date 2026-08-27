alter table public.profiles
  add column if not exists preferred_genres text[] not null default '{}';

alter table public.profiles
  add constraint profiles_preferred_genres_limit
  check (cardinality(preferred_genres) <= 20);

grant update (preferred_genres) on public.profiles to authenticated;
