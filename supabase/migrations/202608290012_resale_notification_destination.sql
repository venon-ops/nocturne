create or replace function public.get_resale_notification_destination(p_listing uuid)
returns table(event_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select t.event_id
  from public.ticket_resale_listings l
  join public.tickets t on t.id = l.ticket_id
  where l.id = p_listing
    and l.seller_id = auth.uid()
$$;

revoke all on function public.get_resale_notification_destination(uuid)
from public, anon;

grant execute on function public.get_resale_notification_destination(uuid)
to authenticated;
