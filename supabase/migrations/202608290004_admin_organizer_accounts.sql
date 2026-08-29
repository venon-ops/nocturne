create or replace function public.set_organizer_account_approval(p_organizer uuid,p_approved boolean)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'admin required';end if;
  if not exists(select 1 from public.organizer_profiles where profile_id=p_organizer) then raise exception 'organizer not found';end if;
  update public.profiles set role=case when p_approved then 'organizer'::public.app_role else 'organizer_pending'::public.app_role end where id=p_organizer and role in ('organizer','organizer_pending');
  if not found then raise exception 'organizer account unavailable';end if;
end;
$$;

revoke all on function public.set_organizer_account_approval(uuid,boolean) from public,anon;
grant execute on function public.set_organizer_account_approval(uuid,boolean) to authenticated;
