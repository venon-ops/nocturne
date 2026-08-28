create or replace function public.get_active_scan_session()
returns table(id uuid,event_id uuid,event_title text,label text,started_at timestamptz)
language sql stable security definer set search_path=public
as $$
  select s.id,s.event_id,e.title,s.label,s.started_at
  from public.scan_sessions s
  join public.events e on e.id=s.event_id
  where s.scanner_id=auth.uid() and s.ended_at is null and public.can_scan_event(s.event_id)
  order by s.started_at desc
  limit 1
$$;

create or replace function public.end_scan_session(p_session uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
begin
  update public.scan_sessions set ended_at=now()
  where id=p_session and scanner_id=auth.uid() and ended_at is null;
  return found;
end;
$$;

revoke all on function public.get_active_scan_session(),public.end_scan_session(uuid) from public,anon;
grant execute on function public.get_active_scan_session(),public.end_scan_session(uuid) to authenticated;
