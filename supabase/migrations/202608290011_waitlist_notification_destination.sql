create or replace function public.get_waitlist_notification_destination(p_waitlist uuid)
returns table(event_slug text, ticket_type_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select e.slug, w.ticket_type_id
  from public.ticket_resale_waitlist w
  join public.ticket_types tt on tt.id = w.ticket_type_id
  join public.events e on e.id = tt.event_id
  where w.id = p_waitlist
    and w.buyer_id = auth.uid()
$$;

revoke all on function public.get_waitlist_notification_destination(uuid)
from public, anon;

grant execute on function public.get_waitlist_notification_destination(uuid)
to authenticated;
