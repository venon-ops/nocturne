create table public.ticket_resale_history(
  listing_id uuid primary key references public.ticket_resale_listings(id) on delete cascade,
  ticket_id uuid not null,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  original_public_code text not null,
  price_cents integer not null,
  seller_refund_cents integer not null,
  sold_at timestamptz not null default now()
);

alter table public.ticket_resale_history enable row level security;
create policy "seller reads resale history" on public.ticket_resale_history for select to authenticated using(seller_id=auth.uid());

create or replace function public.fulfill_ticket_resale(p_listing uuid,p_session text,p_buyer uuid)
returns table(original_checkout_session_id text,seller_refund_cents integer)
language plpgsql security definer set search_path=public
as $$
declare v_listing public.ticket_resale_listings%rowtype;v_ticket public.tickets%rowtype;v_order uuid;v_original_session text;
begin
  select * into v_listing from public.ticket_resale_listings where id=p_listing for update;
  if not found or v_listing.stripe_checkout_session_id<>p_session or v_listing.buyer_id<>p_buyer then raise exception 'invalid resale';end if;
  if v_listing.status in ('refund_pending','refunded') then return query select v_listing.original_checkout_session_id,v_listing.seller_refund_cents;return;end if;
  if v_listing.status<>'reserved' then raise exception 'invalid resale status';end if;
  select * into v_ticket from public.tickets where id=v_listing.ticket_id for update;
  if v_ticket.status<>'resale_pending' then raise exception 'ticket unavailable';end if;
  select stripe_checkout_session_id into v_original_session from public.orders where id=v_ticket.order_id;
  select id into v_order from public.orders where stripe_checkout_session_id=p_session and buyer_id=p_buyer for update;
  if found then update public.orders set total_cents=total_cents+v_listing.price_cents where id=v_order;
  else insert into public.orders(buyer_id,stripe_checkout_session_id,status,total_cents) values(p_buyer,p_session,'paid',v_listing.price_cents) returning id into v_order;
  end if;
  insert into public.ticket_resale_history(listing_id,ticket_id,seller_id,buyer_id,event_id,ticket_type_id,original_public_code,price_cents,seller_refund_cents,sold_at)
  values(v_listing.id,v_ticket.id,v_listing.seller_id,p_buyer,v_ticket.event_id,v_ticket.ticket_type_id,v_ticket.public_code,v_listing.price_cents,v_listing.seller_refund_cents,now())
  on conflict(listing_id) do nothing;
  update public.tickets set order_id=v_order,status='valid',qr_token=gen_random_uuid(),public_code=public.generate_ticket_public_code() where id=v_ticket.id;
  update public.ticket_resale_listings set status='refund_pending',sold_at=now(),updated_at=now() where id=v_listing.id;
  delete from public.ticket_resale_waitlist where ticket_type_id=v_listing.ticket_type_id and buyer_id=p_buyer;
  return query select v_original_session,v_listing.seller_refund_cents;
end;
$$;

revoke all on function public.fulfill_ticket_resale(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.fulfill_ticket_resale(uuid,text,uuid) to service_role;
