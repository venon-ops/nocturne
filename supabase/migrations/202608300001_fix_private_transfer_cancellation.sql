create or replace function public.cancel_ticket_resale(p_ticket uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_listing public.ticket_resale_listings%rowtype;
begin
  select * into v_listing
  from public.ticket_resale_listings
  where ticket_id=p_ticket
  for update;

  if not found or v_listing.seller_id<>auth.uid() then
    raise exception 'listing not found';
  end if;
  if v_listing.status<>'active' and not(v_listing.status='reserved' and v_listing.stripe_checkout_session_id is null) then
    raise exception 'listing unavailable';
  end if;

  -- Keep the private token hash so the mode/token consistency constraint remains valid.
  -- A cancelled token cannot be redeemed because offer lookup requires an active listing.
  update public.ticket_resale_listings
  set status='cancelled',updated_at=now()
  where id=v_listing.id;

  update public.tickets
  set status='valid'
  where id=p_ticket and status='resale_pending';
  return true;
end;
$$;

create or replace function public.get_my_ticket_resale_modes()
returns table(ticket_id uuid,mode public.resale_listing_mode)
language sql stable security definer set search_path=public
as $$
  select l.ticket_id,l.mode
  from public.ticket_resale_listings l
  where l.seller_id=auth.uid()
    and l.status in ('active','reserved')
$$;

revoke all on function public.get_my_ticket_resale_modes() from public,anon;
grant execute on function public.get_my_ticket_resale_modes() to authenticated;
