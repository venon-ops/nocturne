create table public.event_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  reviewer_id uuid not null references public.profiles on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  feedback text check (char_length(feedback) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, reviewer_id)
);

alter table public.event_reviews enable row level security;

create policy "reviewer and organizer read reviews"
on public.event_reviews for select to authenticated
using (
  reviewer_id = auth.uid()
  or public.is_event_owner(event_id)
  or public.is_admin()
);

create policy "users review finished events"
on public.event_reviews for insert to authenticated
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1 from public.events e
    where e.id = event_id
      and coalesce(e.ends_at, e.starts_at) < now()
      and e.status <> 'cancelled'
      and e.organizer_id <> auth.uid()
  )
);

create policy "users update own reviews"
on public.event_reviews for update to authenticated
using (reviewer_id = auth.uid())
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1 from public.events e
    where e.id = event_id
      and coalesce(e.ends_at, e.starts_at) < now()
      and e.status <> 'cancelled'
      and e.organizer_id <> auth.uid()
  )
);

create policy "users delete own reviews"
on public.event_reviews for delete to authenticated
using (reviewer_id = auth.uid());

create index event_reviews_event_id_idx on public.event_reviews(event_id);
