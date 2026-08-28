create or replace function public.end_scan_session(p_session uuid)
returns boolean
language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.scan_sessions where id=p_session and scanner_id=auth.uid()) then
    return false;
  end if;
  update public.scan_sessions set ended_at=coalesce(ended_at,now()) where id=p_session;
  return true;
end;
$$;

revoke all on function public.end_scan_session(uuid) from public,anon;
grant execute on function public.end_scan_session(uuid) to authenticated;
