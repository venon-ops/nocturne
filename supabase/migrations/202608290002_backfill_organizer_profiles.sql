insert into public.organizer_profiles(profile_id,name,onboarding_complete)
select
  p.id,
  coalesce(nullif(trim(p.display_name),''),'Organisation'),
  false
from public.profiles p
where p.role in ('organizer','organizer_pending')
on conflict(profile_id) do nothing;
