alter table public.scan_sessions
  add column if not exists ended_reason text
  check (ended_reason is null or ended_reason in ('scanner','organizer'));

create table if not exists public.scanner_auth_events(
  id uuid primary key default gen_random_uuid(),
  scanner_id uuid not null references public.profiles(id) on delete cascade,
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check(event_type in ('login','logout')),
  occurred_at timestamptz not null default now()
);

create index if not exists scanner_auth_events_scanner_idx
  on public.scanner_auth_events(scanner_id,occurred_at desc);
create index if not exists scanner_auth_events_organizer_idx
  on public.scanner_auth_events(organizer_id,occurred_at desc);

alter table public.scanner_auth_events enable row level security;
create policy "scanner activity visible to organization"
  on public.scanner_auth_events for select
  using(scanner_id=auth.uid() or organizer_id=auth.uid() or public.is_admin());

create or replace function public.log_scanner_auth_event(p_event text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_organizer uuid;
begin
  if p_event not in ('login','logout') then raise exception 'invalid event'; end if;
  select organizer_id into v_organizer from public.scanner_accounts
  where profile_id=auth.uid() and active;
  if v_organizer is null then return false; end if;
  insert into public.scanner_auth_events(scanner_id,organizer_id,event_type)
  values(auth.uid(),v_organizer,p_event);
  return true;
end;
$$;

create or replace function public.end_scan_session(p_session uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.scan_sessions where id=p_session and scanner_id=auth.uid()) then
    return false;
  end if;
  update public.scan_sessions
  set ended_at=coalesce(ended_at,now()),ended_reason=coalesce(ended_reason,'scanner')
  where id=p_session;
  return true;
end;
$$;

revoke all on function public.log_scanner_auth_event(text) from public,anon;
grant execute on function public.log_scanner_auth_event(text) to authenticated;
