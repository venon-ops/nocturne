drop function if exists public.get_offline_ticket_manifest(uuid);
create function public.get_offline_ticket_manifest(p_event uuid)
returns table(ticket_hash text,ticket_id uuid,public_code text,attendee_name text,ticket_status public.ticket_status)
language plpgsql security definer set search_path=public,extensions
as $$
begin
  if not public.can_scan_event(p_event) then raise exception 'not authorized'; end if;
  return query select encode(digest(t.qr_token::text,'sha256'),'hex'),t.id,t.public_code,t.attendee_name,t.status from public.tickets t where t.event_id=p_event;
end;
$$;

create or replace function public.validate_ticket_public_code_for_session(p_code text,p_event uuid,p_session uuid)
returns table(result text,ticket_id uuid,attendee_name text)
language plpgsql security definer set search_path=public
as $$
declare v_ticket public.tickets%rowtype;
begin
  if not public.can_scan_event(p_event) or not exists(select 1 from public.scan_sessions s where s.id=p_session and s.event_id=p_event and s.scanner_id=auth.uid() and s.ended_at is null) then raise exception 'not authorized'; end if;
  select t.* into v_ticket from public.tickets t where t.public_code=upper(trim(p_code)) for update;
  if not found then return query select 'invalid'::text,null::uuid,null::text;return;end if;
  if v_ticket.event_id<>p_event then return query select 'wrong_event'::text,v_ticket.id,v_ticket.attendee_name;return;end if;
  if v_ticket.status='used' then return query select 'already_used'::text,v_ticket.id,v_ticket.attendee_name;return;end if;
  if v_ticket.status<>'valid' then return query select 'invalid'::text,v_ticket.id,v_ticket.attendee_name;return;end if;
  update public.tickets set status='used' where id=v_ticket.id;
  insert into public.check_ins(ticket_id,event_id,scanned_by,scan_session_id) values(v_ticket.id,p_event,auth.uid(),p_session);
  return query select 'accepted'::text,v_ticket.id,v_ticket.attendee_name;
end;
$$;

revoke all on function public.get_offline_ticket_manifest(uuid),public.validate_ticket_public_code_for_session(text,uuid,uuid) from public,anon;
grant execute on function public.get_offline_ticket_manifest(uuid),public.validate_ticket_public_code_for_session(text,uuid,uuid) to authenticated;
