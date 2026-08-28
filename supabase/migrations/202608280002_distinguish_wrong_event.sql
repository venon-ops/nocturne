create or replace function public.validate_ticket_token_for_event(
  p_token uuid,
  p_scanner uuid,
  p_event uuid
)
returns table(result text, ticket_id uuid, attendee_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket public.tickets%rowtype;
begin
  if p_scanner <> auth.uid() or not public.is_event_owner(p_event) then
    raise exception 'not authorized';
  end if;

  select t.* into v_ticket
  from public.tickets t
  where t.qr_token = p_token
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid, null::text;
    return;
  end if;

  if v_ticket.event_id <> p_event then
    if public.is_event_owner(v_ticket.event_id) then
      return query select 'wrong_event'::text, v_ticket.id, v_ticket.attendee_name;
      return;
    end if;
    raise exception 'not authorized';
  end if;

  if v_ticket.status = 'used' then
    return query select 'already_used'::text, v_ticket.id, v_ticket.attendee_name;
    return;
  end if;

  if v_ticket.status <> 'valid' then
    return query select 'invalid'::text, v_ticket.id, v_ticket.attendee_name;
    return;
  end if;

  update public.tickets set status = 'used' where id = v_ticket.id;
  insert into public.check_ins(ticket_id, event_id, scanned_by)
  values(v_ticket.id, p_event, p_scanner);

  return query select 'accepted'::text, v_ticket.id, v_ticket.attendee_name;
end;
$$;
