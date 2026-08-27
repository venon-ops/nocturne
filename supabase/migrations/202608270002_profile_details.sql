alter table public.profiles
  add column if not exists username text,
  add column if not exists city text,
  add column if not exists bio text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_username_unique
  on public.profiles (lower(username))
  where username is not null;

alter table public.profiles
  add constraint profiles_username_format
  check (
    username is null
    or username ~ '^[a-zA-Z0-9_]{3,30}$'
  );

alter table public.profiles
  add constraint profiles_bio_length
  check (
    bio is null
    or char_length(bio) <= 300
  );

create or replace function public.handle_profile_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_profile_updated on public.profiles;

create trigger on_profile_updated
before update on public.profiles
for each row
execute function public.handle_profile_updated_at();