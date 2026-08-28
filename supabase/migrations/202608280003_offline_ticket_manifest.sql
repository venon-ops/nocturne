create or replace function public.get_offline_ticket_manifest(p_event uuid)
returns table(
  ticket_hash text,
  ticket_id uuid,
  attendee_name text,
  ticket_status public.ticket_status
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_event_owner(p_event) then
    raise exception 'not authorized';
  end if;

  return query
  select
    encode(digest(t.qr_token::text, 'sha256'), 'hex'),
    t.id,
    t.attendee_name,
    t.status
  from public.tickets t
  where t.event_id = p_event;
end;
$$;

create or replace function public.sync_offline_ticket_scan(
  p_ticket_hash text,
  p_event uuid,
  p_scanner uuid,
  p_scanned_at timestamptz
)
returns table(result text, ticket_id uuid, attendee_name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ticket public.tickets%rowtype;
  v_scanned_at timestamptz;
begin
  if p_scanner <> auth.uid() or not public.is_event_owner(p_event) then
    raise exception 'not authorized';
  end if;

  select t.* into v_ticket
  from public.tickets t
  where t.event_id = p_event
    and encode(digest(t.qr_token::text, 'sha256'), 'hex') = p_ticket_hash
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  if v_ticket.status = 'used' then
    return query select 'already_used'::text, v_ticket.id, v_ticket.attendee_name;
    return;
  end if;

  if v_ticket.status <> 'valid' then
    return query select 'invalid'::text, v_ticket.id, v_ticket.attendee_name;
    return;
  end if;

  v_scanned_at := least(greatest(p_scanned_at, now() - interval '7 days'), now());
  update public.tickets set status = 'used' where id = v_ticket.id;
  insert into public.check_ins(ticket_id, event_id, scanned_by, scanned_at)
  values(v_ticket.id, p_event, p_scanner, v_scanned_at);

  return query select 'accepted'::text, v_ticket.id, v_ticket.attendee_name;
end;
$$;
