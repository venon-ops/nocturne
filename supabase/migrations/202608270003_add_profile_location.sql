alter table public.profiles
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table public.profiles
  add constraint profiles_latitude_range
  check (
    latitude is null
    or latitude between -90 and 90
  );

alter table public.profiles
  add constraint profiles_longitude_range
  check (
    longitude is null
    or longitude between -180 and 180
  );