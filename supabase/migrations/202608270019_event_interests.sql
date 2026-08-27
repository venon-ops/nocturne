create table if not exists public.event_interests (
  event_id uuid not null references public.events on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key(event_id,user_id)
);

alter table public.event_interests enable row level security;
create policy "public event interests" on public.event_interests for select using(true);
create policy "own event interests insert" on public.event_interests for insert with check(user_id=auth.uid());
create policy "own event interests delete" on public.event_interests for delete using(user_id=auth.uid());

