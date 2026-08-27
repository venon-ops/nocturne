create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_is_organizer boolean := coalesce(new.raw_user_meta_data->>'account_type','') = 'organizer';
  v_name text := coalesce(new.raw_user_meta_data->>'organization_name',new.raw_user_meta_data->>'full_name','');
begin
  insert into public.profiles(id,display_name,role)
  values(new.id,v_name,case when v_is_organizer then 'organizer_pending'::public.app_role else 'user'::public.app_role end);
  if v_is_organizer then
    insert into public.organizer_profiles(profile_id,name,onboarding_complete)
    values(new.id,coalesce(nullif(v_name,''),'Organisation'),false);
  end if;
  return new;
end;
$$;

create policy "own organizer profile"
on public.organizer_profiles for select to authenticated
using (profile_id=auth.uid() or public.is_admin());

create policy "own organizer profile update"
on public.organizer_profiles for update to authenticated
using (profile_id=auth.uid() or public.is_admin())
with check (profile_id=auth.uid() or public.is_admin());
