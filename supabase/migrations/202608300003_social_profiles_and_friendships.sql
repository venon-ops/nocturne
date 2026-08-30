alter table public.profiles
  add column if not exists social_links jsonb not null default '{}'::jsonb;

alter table public.profiles drop constraint if exists profiles_social_links_object;
alter table public.profiles add constraint profiles_social_links_object
  check (jsonb_typeof(social_links) = 'object');

grant update (social_links) on public.profiles to authenticated;

create table if not exists public.user_friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined','blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists user_friendships_pair_unique
  on public.user_friendships (least(requester_id,addressee_id),greatest(requester_id,addressee_id));

alter table public.user_friendships enable row level security;

drop policy if exists "friendships visible to participants" on public.user_friendships;
create policy "friendships visible to participants" on public.user_friendships
  for select to authenticated
  using (auth.uid() in (requester_id,addressee_id));

drop policy if exists "users request friendships" on public.user_friendships;
create policy "users request friendships" on public.user_friendships
  for insert to authenticated
  with check (requester_id=auth.uid() and addressee_id<>auth.uid() and status='pending');

drop policy if exists "participants update friendships" on public.user_friendships;
create policy "participants update friendships" on public.user_friendships
  for update to authenticated
  using (auth.uid() in (requester_id,addressee_id))
  with check (auth.uid() in (requester_id,addressee_id));

drop policy if exists "participants delete friendships" on public.user_friendships;
create policy "participants delete friendships" on public.user_friendships
  for delete to authenticated
  using (auth.uid() in (requester_id,addressee_id));

grant select,insert,update,delete on public.user_friendships to authenticated;
