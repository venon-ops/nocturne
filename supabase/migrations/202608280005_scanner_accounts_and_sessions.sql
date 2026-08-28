alter type public.app_role add value if not exists 'scanner' after 'organizer_pending';

create table public.scanner_accounts(
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint scanner_accounts_username_format check(username ~ '^[a-z0-9][a-z0-9._-]{2,31}$')
);
create unique index scanner_accounts_username_unique on public.scanner_accounts(lower(username));
create index scanner_accounts_organizer_idx on public.scanner_accounts(organizer_id);

create table public.scan_sessions(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  scanner_id uuid not null references public.profiles(id) on delete cascade,
  label text not null check(char_length(trim(label)) between 2 and 60),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index scan_sessions_event_idx on public.scan_sessions(event_id,started_at desc);
alter table public.check_ins add column scan_session_id uuid references public.scan_sessions(id) on delete set null;

alter table public.scanner_accounts enable row level security;
alter table public.scan_sessions enable row level security;
create policy "organizers read scanner accounts" on public.scanner_accounts for select using(organizer_id=auth.uid() or public.is_admin());
create policy "scanners read own account" on public.scanner_accounts for select using(profile_id=auth.uid());
create policy "scan sessions visible to organization" on public.scan_sessions for select using(scanner_id=auth.uid() or public.is_event_owner(event_id) or public.is_admin());

create or replace function public.can_scan_event(p_event uuid)
returns boolean
language sql stable security definer set search_path=public
as $$
  select exists(
    select 1 from public.events e
    where e.id=p_event and (
      e.organizer_id=auth.uid()
      or public.is_admin()
      or exists(select 1 from public.scanner_accounts s where s.profile_id=auth.uid() and s.organizer_id=e.organizer_id and s.active)
    )
  )
$$;

create policy "scanner event checkins" on public.check_ins for select using(public.can_scan_event(event_id));

create or replace function public.get_scan_events()
returns table(id uuid,title text,city text,starts_at timestamptz,ends_at timestamptz,status public.event_status)
language sql stable security definer set search_path=public
as $$
  select e.id,e.title,e.city,e.starts_at,e.ends_at,e.status
  from public.events e
  where e.status='published' and e.ends_at>=now() and public.can_scan_event(e.id)
  order by e.starts_at
$$;

create or replace function public.start_scan_session(p_event uuid,p_label text)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if not public.can_scan_event(p_event) then raise exception 'not authorized'; end if;
  if char_length(trim(p_label)) not between 2 and 60 then raise exception 'invalid label'; end if;
  insert into public.scan_sessions(event_id,scanner_id,label) values(p_event,auth.uid(),trim(p_label)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.get_offline_ticket_manifest(p_event uuid)
returns table(ticket_hash text,ticket_id uuid,attendee_name text,ticket_status public.ticket_status)
language plpgsql security definer set search_path=public,extensions
as $$
begin
  if not public.can_scan_event(p_event) then raise exception 'not authorized'; end if;
  return query select encode(digest(t.qr_token::text,'sha256'),'hex'),t.id,t.attendee_name,t.status from public.tickets t where t.event_id=p_event;
end;
$$;

create or replace function public.validate_ticket_token_for_session(p_token uuid,p_event uuid,p_session uuid)
returns table(result text,ticket_id uuid,attendee_name text)
language plpgsql security definer set search_path=public
as $$
declare v_ticket public.tickets%rowtype;
begin
  if not public.can_scan_event(p_event) or not exists(select 1 from public.scan_sessions s where s.id=p_session and s.event_id=p_event and s.scanner_id=auth.uid() and s.ended_at is null) then raise exception 'not authorized'; end if;
  select t.* into v_ticket from public.tickets t where t.qr_token=p_token for update;
  if not found then return query select 'invalid'::text,null::uuid,null::text;return;end if;
  if v_ticket.event_id<>p_event then return query select 'wrong_event'::text,v_ticket.id,v_ticket.attendee_name;return;end if;
  if v_ticket.status='used' then return query select 'already_used'::text,v_ticket.id,v_ticket.attendee_name;return;end if;
  if v_ticket.status<>'valid' then return query select 'invalid'::text,v_ticket.id,v_ticket.attendee_name;return;end if;
  update public.tickets set status='used' where id=v_ticket.id;
  insert into public.check_ins(ticket_id,event_id,scanned_by,scan_session_id) values(v_ticket.id,p_event,auth.uid(),p_session);
  return query select 'accepted'::text,v_ticket.id,v_ticket.attendee_name;
end;
$$;

create or replace function public.sync_offline_ticket_scan_for_session(p_ticket_hash text,p_event uuid,p_session uuid,p_scanned_at timestamptz)
returns table(result text,ticket_id uuid,attendee_name text)
language plpgsql security definer set search_path=public,extensions
as $$
declare v_ticket public.tickets%rowtype;v_scanned_at timestamptz;
begin
  if not public.can_scan_event(p_event) or not exists(select 1 from public.scan_sessions s where s.id=p_session and s.event_id=p_event and s.scanner_id=auth.uid()) then raise exception 'not authorized'; end if;
  select t.* into v_ticket from public.tickets t where t.event_id=p_event and encode(digest(t.qr_token::text,'sha256'),'hex')=p_ticket_hash for update;
  if not found then return query select 'invalid'::text,null::uuid,null::text;return;end if;
  if v_ticket.status='used' then return query select 'already_used'::text,v_ticket.id,v_ticket.attendee_name;return;end if;
  if v_ticket.status<>'valid' then return query select 'invalid'::text,v_ticket.id,v_ticket.attendee_name;return;end if;
  v_scanned_at:=least(greatest(p_scanned_at,now()-interval '7 days'),now());
  update public.tickets set status='used' where id=v_ticket.id;
  insert into public.check_ins(ticket_id,event_id,scanned_by,scanned_at,scan_session_id) values(v_ticket.id,p_event,auth.uid(),v_scanned_at,p_session);
  return query select 'accepted'::text,v_ticket.id,v_ticket.attendee_name;
end;
$$;

revoke all on function public.get_scan_events(),public.start_scan_session(uuid,text),public.validate_ticket_token_for_session(uuid,uuid,uuid),public.sync_offline_ticket_scan_for_session(text,uuid,uuid,timestamptz) from public,anon;
grant execute on function public.can_scan_event(uuid),public.get_scan_events(),public.start_scan_session(uuid,text),public.validate_ticket_token_for_session(uuid,uuid,uuid),public.sync_offline_ticket_scan_for_session(text,uuid,uuid,timestamptz) to authenticated;
