insert into public.ticket_resale_history(
  listing_id,
  ticket_id,
  seller_id,
  buyer_id,
  event_id,
  ticket_type_id,
  original_public_code,
  price_cents,
  seller_refund_cents,
  sold_at
)
select
  l.id,
  l.ticket_id,
  l.seller_id,
  l.buyer_id,
  t.event_id,
  l.ticket_type_id,
  'ARCHIVE-' || upper(substr(replace(l.id::text,'-',''),1,8)),
  l.price_cents,
  l.seller_refund_cents,
  coalesce(l.sold_at,l.updated_at)
from public.ticket_resale_listings l
join public.tickets t on t.id=l.ticket_id
where l.status in ('refund_pending','refunded')
  and l.buyer_id is not null
on conflict(listing_id) do nothing;
