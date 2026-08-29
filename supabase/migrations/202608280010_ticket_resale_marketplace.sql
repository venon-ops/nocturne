alter table public.ticket_types add column sales_cutoff_at timestamptz;
update public.ticket_types tt set sales_cutoff_at=(date_trunc('day',e.starts_at at time zone 'Europe/Paris')+interval '1 day 3 hours') at time zone 'Europe/Paris' from public.events e where e.id=tt.event_id;
alter table public.ticket_types alter column sales_cutoff_at set not null;

create type public.resale_listing_status as enum ('active','reserved','sold','cancelled','refund_pending','refunded');
create type public.resale_listing_mode as enum ('public','private');
create type public.resale_waitlist_mode as enum ('notification','auto_pay');
create type public.resale_waitlist_status as enum ('setup_required','active','reserved','action_required','fulfilled','cancelled','expired');

create table public.ticket_resale_listings(
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  ticket_type_id uuid not null references public.ticket_types(id),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid references public.profiles(id) on delete set null,
  mode public.resale_listing_mode not null default 'public',
  price_cents integer not null check(price_cents>0),
  fee_cents integer not null check(fee_cents>=0),
  seller_refund_cents integer not null check(seller_refund_cents>0),
  status public.resale_listing_status not null default 'active',
  private_token_hash text unique,
  original_checkout_session_id text not null,
  stripe_checkout_session_id text unique,
  stripe_refund_id text unique,
  reserved_until timestamptz,
  sold_at timestamptz,
  refunded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(fee_cents+seller_refund_cents=price_cents),
  check((mode='private')=(private_token_hash is not null))
);

create table public.ticket_resale_waitlist(
  id uuid primary key default gen_random_uuid(),
  ticket_type_id uuid not null references public.ticket_types(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  requested_quantity integer not null default 1 check(requested_quantity between 1 and 10),
  mode public.resale_waitlist_mode not null default 'notification',
  status public.resale_waitlist_status not null default 'active',
  stripe_customer_id text,
  stripe_payment_method_id text,
  stripe_setup_session_id text unique,
  consented_at timestamptz,
  reserved_listing_ids uuid[],
  reserved_until timestamptz,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  unique(ticket_type_id,buyer_id)
);

create index ticket_resale_available_idx on public.ticket_resale_listings(ticket_type_id,status,mode,created_at);
create index ticket_resale_waitlist_order_idx on public.ticket_resale_waitlist(ticket_type_id,created_at);
alter table public.ticket_resale_listings enable row level security;
alter table public.ticket_resale_waitlist enable row level security;
create policy "own resale waitlist" on public.ticket_resale_waitlist for select using(buyer_id=auth.uid());

create or replace function public.list_ticket_for_resale(p_ticket uuid)
returns uuid
language plpgsql security definer set search_path=public
as $$
declare v_ticket public.tickets%rowtype;v_listing uuid;v_price integer;v_seller uuid;
begin
  v_seller:=auth.uid();if v_seller is null then raise exception 'authentication required';end if;
  select t.* into v_ticket from public.tickets t join public.orders o on o.id=t.order_id where t.id=p_ticket and o.buyer_id=v_seller for update of t;
  if not found then raise exception 'ticket not found';end if;
  if v_ticket.status<>'valid' then raise exception 'ticket unavailable';end if;
  if not exists(select 1 from public.events e join public.organizer_profiles op on op.profile_id=e.organizer_id join public.ticket_types tt on tt.id=v_ticket.ticket_type_id where e.id=v_ticket.event_id and tt.sales_cutoff_at>now() and e.status='published' and op.stripe_account_id is not null) then raise exception 'resale closed';end if;
  select price_cents into v_price from public.ticket_types where id=v_ticket.ticket_type_id;
  if (select stripe_checkout_session_id from public.orders where id=v_ticket.order_id) is null then raise exception 'original payment unavailable';end if;
  insert into public.ticket_resale_listings(ticket_id,ticket_type_id,seller_id,mode,price_cents,fee_cents,seller_refund_cents,status,private_token_hash,original_checkout_session_id,buyer_id,stripe_checkout_session_id,reserved_until,updated_at)
  values(v_ticket.id,v_ticket.ticket_type_id,v_seller,'public',v_price,round(v_price*.05),v_price-round(v_price*.05),'active',null,(select stripe_checkout_session_id from public.orders where id=v_ticket.order_id),null,null,null,now())
  on conflict(ticket_id) do update set ticket_type_id=excluded.ticket_type_id,seller_id=excluded.seller_id,mode='public',price_cents=excluded.price_cents,fee_cents=excluded.fee_cents,seller_refund_cents=excluded.seller_refund_cents,status='active',private_token_hash=null,original_checkout_session_id=excluded.original_checkout_session_id,buyer_id=null,stripe_checkout_session_id=null,reserved_until=null,updated_at=now()
  returning id into v_listing;
  update public.tickets set status='resale_pending' where id=v_ticket.id;
  return v_listing;
end;
$$;

create or replace function public.create_private_ticket_resale(p_ticket uuid)
returns text
language plpgsql security definer set search_path=public,extensions
as $$
declare v_ticket public.tickets%rowtype;v_price integer;v_seller uuid;v_token text;
begin
  v_seller:=auth.uid();if v_seller is null then raise exception 'authentication required';end if;
  select t.* into v_ticket from public.tickets t join public.orders o on o.id=t.order_id where t.id=p_ticket and o.buyer_id=v_seller for update of t;
  if not found then raise exception 'ticket not found';end if;
  if v_ticket.status<>'valid' then raise exception 'ticket unavailable';end if;
  if not exists(select 1 from public.events e join public.organizer_profiles op on op.profile_id=e.organizer_id join public.ticket_types tt on tt.id=v_ticket.ticket_type_id where e.id=v_ticket.event_id and tt.sales_cutoff_at>now() and e.status='published' and op.stripe_account_id is not null) then raise exception 'resale closed';end if;
  select price_cents into v_price from public.ticket_types where id=v_ticket.ticket_type_id;v_token:=encode(gen_random_bytes(24),'hex');
  if (select stripe_checkout_session_id from public.orders where id=v_ticket.order_id) is null then raise exception 'original payment unavailable';end if;
  insert into public.ticket_resale_listings(ticket_id,ticket_type_id,seller_id,mode,price_cents,fee_cents,seller_refund_cents,status,private_token_hash,original_checkout_session_id,updated_at)
  values(v_ticket.id,v_ticket.ticket_type_id,v_seller,'private',v_price,round(v_price*.05),v_price-round(v_price*.05),'active',encode(digest(v_token,'sha256'),'hex'),(select stripe_checkout_session_id from public.orders where id=v_ticket.order_id),now())
  on conflict(ticket_id) do update set ticket_type_id=excluded.ticket_type_id,seller_id=excluded.seller_id,mode='private',price_cents=excluded.price_cents,fee_cents=excluded.fee_cents,seller_refund_cents=excluded.seller_refund_cents,status='active',private_token_hash=excluded.private_token_hash,original_checkout_session_id=excluded.original_checkout_session_id,buyer_id=null,stripe_checkout_session_id=null,reserved_until=null,updated_at=now();
  update public.tickets set status='resale_pending' where id=v_ticket.id;return v_token;
end;
$$;

create or replace function public.cancel_ticket_resale(p_ticket uuid)
returns boolean language plpgsql security definer set search_path=public
as $$
declare v_listing public.ticket_resale_listings%rowtype;
begin
  select * into v_listing from public.ticket_resale_listings where ticket_id=p_ticket for update;
  if not found or v_listing.seller_id<>auth.uid() then raise exception 'listing not found';end if;
  if v_listing.status<>'active' and not(v_listing.status='reserved' and v_listing.stripe_checkout_session_id is null) then raise exception 'listing unavailable';end if;
  update public.ticket_resale_listings set status='cancelled',private_token_hash=null,updated_at=now() where id=v_listing.id;
  update public.tickets set status='valid' where id=p_ticket and status='resale_pending';return true;
end;
$$;

create or replace function public.join_ticket_resale_waitlist(p_ticket_type uuid,p_quantity integer default 1,p_auto_pay boolean default false)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required';end if;
  if p_quantity not between 1 and 10 then raise exception 'invalid quantity';end if;
  if not exists(select 1 from public.ticket_types tt join public.events e on e.id=tt.event_id where tt.id=p_ticket_type and tt.sales_cutoff_at>now() and tt.sold_quantity>=tt.quantity) then raise exception 'waitlist unavailable';end if;
  insert into public.ticket_resale_waitlist(ticket_type_id,buyer_id,requested_quantity,mode,status,consented_at,stripe_payment_method_id,reserved_listing_ids,reserved_until)
  values(p_ticket_type,auth.uid(),p_quantity,case when p_auto_pay then 'auto_pay'::public.resale_waitlist_mode else 'notification'::public.resale_waitlist_mode end,case when p_auto_pay then 'setup_required'::public.resale_waitlist_status else 'active'::public.resale_waitlist_status end,case when p_auto_pay then now() else null end,null,null,null)
  on conflict(ticket_type_id,buyer_id) do update set requested_quantity=excluded.requested_quantity,mode=excluded.mode,status=excluded.status,consented_at=excluded.consented_at,stripe_payment_method_id=null,reserved_listing_ids=null,reserved_until=null,created_at=now()
  returning id into v_id;return v_id;
end;
$$;

create or replace function public.leave_ticket_resale_waitlist(p_ticket_type uuid)
returns boolean language sql security definer set search_path=public
as $$delete from public.ticket_resale_waitlist where ticket_type_id=p_ticket_type and buyer_id=auth.uid() returning true$$;

create or replace function public.get_resale_offer_by_token(p_token text)
returns table(listing_id uuid,event_slug text,event_title text,event_city text,event_starts_at timestamptz,ticket_type_name text,price_cents integer)
language sql stable security definer set search_path=public,extensions
as $$
  select l.id,e.slug,e.title,e.city,e.starts_at,tt.name,l.price_cents from public.ticket_resale_listings l join public.tickets t on t.id=l.ticket_id join public.events e on e.id=t.event_id join public.ticket_types tt on tt.id=l.ticket_type_id
  where l.mode='private' and l.status='active' and l.private_token_hash=encode(digest(p_token,'sha256'),'hex') and tt.sales_cutoff_at>now()
$$;

create or replace function public.get_ticket_resale_availability(p_event uuid)
returns table(ticket_type_id uuid,available bigint)
language sql stable security definer set search_path=public
as $$select l.ticket_type_id,count(*) from public.ticket_resale_listings l join public.tickets t on t.id=l.ticket_id join public.ticket_types tt on tt.id=l.ticket_type_id where t.event_id=p_event and l.mode='public' and l.status='active' and t.status='resale_pending' and tt.sales_cutoff_at>now() group by l.ticket_type_id$$;

create or replace function public.reserve_private_ticket_resale(p_token text,p_buyer uuid)
returns table(listing_id uuid,ticket_id uuid,seller_id uuid,price_cents integer,fee_cents integer,seller_refund_cents integer,original_checkout_session_id text,event_title text,ticket_type_name text,organizer_stripe_account_id text)
language plpgsql security definer set search_path=public,extensions
as $$
declare v_listing public.ticket_resale_listings%rowtype;
begin
  if p_buyer is null then raise exception 'authentication required';end if;
  update public.ticket_resale_listings set status='active',buyer_id=null,reserved_until=null,stripe_checkout_session_id=null,updated_at=now() where mode='private' and status='reserved' and reserved_until<now();
  select * into v_listing from public.ticket_resale_listings where mode='private' and private_token_hash=encode(digest(p_token,'sha256'),'hex') for update;
  if not found or v_listing.status<>'active' then raise exception 'offer unavailable';end if;
  if v_listing.seller_id=p_buyer then raise exception 'seller cannot buy own ticket';end if;
  if not exists(select 1 from public.tickets t join public.ticket_types tt on tt.id=t.ticket_type_id where t.id=v_listing.ticket_id and t.status='resale_pending' and tt.sales_cutoff_at>now()) then raise exception 'resale closed';end if;
  update public.ticket_resale_listings set status='reserved',buyer_id=p_buyer,reserved_until=now()+interval '30 minutes',updated_at=now() where id=v_listing.id;
  return query select v_listing.id,t.id,v_listing.seller_id,v_listing.price_cents,v_listing.fee_cents,v_listing.seller_refund_cents,v_listing.original_checkout_session_id,e.title,tt.name,op.stripe_account_id
  from public.tickets t join public.events e on e.id=t.event_id join public.ticket_types tt on tt.id=t.ticket_type_id left join public.organizer_profiles op on op.profile_id=e.organizer_id where t.id=v_listing.ticket_id;
end;
$$;

create or replace function public.reserve_public_ticket_resales(p_ticket_type uuid,p_buyer uuid,p_quantity integer)
returns table(listing_id uuid,fee_cents integer)
language plpgsql security definer set search_path=public
as $$
declare v_listing public.ticket_resale_listings%rowtype;v_count integer:=0;
begin
  if p_buyer is null or p_quantity<1 then raise exception 'invalid reservation';end if;
  update public.ticket_resale_listings set status='active',buyer_id=null,reserved_until=null,stripe_checkout_session_id=null,updated_at=now() where mode='public' and status='reserved' and reserved_until<now();
  for v_listing in select l.* from public.ticket_resale_listings l join public.tickets t on t.id=l.ticket_id join public.ticket_types tt on tt.id=l.ticket_type_id where l.ticket_type_id=p_ticket_type and l.mode='public' and l.status='reserved' and l.buyer_id=p_buyer and l.stripe_checkout_session_id is null and l.reserved_until>now() and t.status='resale_pending' and tt.sales_cutoff_at>now() order by l.created_at for update of l skip locked limit p_quantity
  loop
    update public.ticket_resale_listings set reserved_until=now()+interval '30 minutes',updated_at=now() where id=v_listing.id;
    listing_id:=v_listing.id;fee_cents:=v_listing.fee_cents;v_count:=v_count+1;return next;
  end loop;
  for v_listing in select l.* from public.ticket_resale_listings l join public.tickets t on t.id=l.ticket_id join public.ticket_types tt on tt.id=l.ticket_type_id where l.ticket_type_id=p_ticket_type and l.mode='public' and l.status='active' and l.seller_id<>p_buyer and t.status='resale_pending' and tt.sales_cutoff_at>now() order by l.created_at for update of l skip locked limit greatest(0,p_quantity-v_count)
  loop
    update public.ticket_resale_listings set status='reserved',buyer_id=p_buyer,reserved_until=now()+interval '30 minutes',updated_at=now() where id=v_listing.id;
    listing_id:=v_listing.id;fee_cents:=v_listing.fee_cents;v_count:=v_count+1;return next;
  end loop;
end;
$$;

create or replace function public.attach_resale_checkout(p_listing uuid,p_buyer uuid,p_session text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  update public.ticket_resale_listings set stripe_checkout_session_id=p_session,updated_at=now() where id=p_listing and status='reserved' and buyer_id=p_buyer;
  if not found then raise exception 'reservation unavailable';end if;
end;
$$;

create or replace function public.release_resale_reservation(p_listing uuid,p_buyer uuid)
returns void language sql security definer set search_path=public
as $$update public.ticket_resale_listings set status='active',buyer_id=null,reserved_until=null,stripe_checkout_session_id=null,updated_at=now() where id=p_listing and status='reserved' and buyer_id=p_buyer$$;

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
  update public.tickets set order_id=v_order,status='valid',qr_token=gen_random_uuid(),public_code=public.generate_ticket_public_code() where id=v_ticket.id;
  update public.ticket_resale_listings set status='refund_pending',sold_at=now(),updated_at=now() where id=v_listing.id;
  delete from public.ticket_resale_waitlist where ticket_type_id=v_listing.ticket_type_id and buyer_id=p_buyer;
  return query select v_original_session,v_listing.seller_refund_cents;
end;
$$;

create or replace function public.mark_ticket_resale_refunded(p_listing uuid,p_refund text)
returns void language plpgsql security definer set search_path=public
as $$
declare v_listing public.ticket_resale_listings%rowtype;
begin
  update public.ticket_resale_listings set status='refunded',stripe_refund_id=p_refund,refunded_at=coalesce(refunded_at,now()),updated_at=now() where id=p_listing and status in ('refund_pending','refunded') returning * into v_listing;
  if not found then raise exception 'resale not fulfilled';end if;
  if not exists(select 1 from public.notifications where profile_id=v_listing.seller_id and type='ticket_resold' and payload->>'listing_id'=p_listing::text) then
    insert into public.notifications(profile_id,type,payload) values(v_listing.seller_id,'ticket_resold',jsonb_build_object('listing_id',p_listing,'refund_cents',v_listing.seller_refund_cents,'stripe_refund_id',p_refund));
  end if;
end;
$$;

create or replace function public.activate_auto_pay_waitlist(p_waitlist uuid,p_buyer uuid,p_customer text,p_payment_method text,p_setup_session text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  update public.ticket_resale_waitlist set status='active',stripe_customer_id=p_customer,stripe_payment_method_id=p_payment_method,stripe_setup_session_id=p_setup_session where id=p_waitlist and buyer_id=p_buyer and mode='auto_pay' and status='setup_required';
  if not found then raise exception 'waitlist setup unavailable';end if;
end;
$$;

create or replace function public.reserve_next_waitlist_batch(p_ticket_type uuid)
returns table(waitlist_id uuid,buyer_id uuid,requested_quantity integer,mode public.resale_waitlist_mode,listing_ids uuid[],price_cents integer,fee_cents integer,stripe_customer_id text,stripe_payment_method_id text,organizer_stripe_account_id text,event_title text,ticket_type_name text)
language plpgsql security definer set search_path=public
as $$
declare v_wait public.ticket_resale_waitlist%rowtype;v_listing public.ticket_resale_listings%rowtype;v_ids uuid[]:='{}';v_price integer;v_fee integer:=0;v_org text;v_event_title text;v_type_name text;
begin
  update public.ticket_resale_listings l set status='active',buyer_id=null,reserved_until=null,stripe_checkout_session_id=null,updated_at=now() where l.id in(select unnest(w.reserved_listing_ids) from public.ticket_resale_waitlist w where w.ticket_type_id=p_ticket_type and w.status in ('reserved','action_required') and w.reserved_until<now());
  update public.ticket_resale_waitlist set status='active',reserved_listing_ids=null,reserved_until=null where ticket_type_id=p_ticket_type and status in ('reserved','action_required') and reserved_until<now();
  select w.* into v_wait from public.ticket_resale_waitlist w join public.ticket_types tt on tt.id=w.ticket_type_id where w.ticket_type_id=p_ticket_type and w.status='active' and tt.sales_cutoff_at>now() and (w.mode='notification' or (w.stripe_customer_id is not null and w.stripe_payment_method_id is not null)) and (select count(*) from public.ticket_resale_listings l where l.ticket_type_id=p_ticket_type and l.mode='public' and l.status='active' and l.seller_id<>w.buyer_id)>=w.requested_quantity order by w.created_at for update of w skip locked limit 1;
  if not found then return;end if;
  for v_listing in select * from public.ticket_resale_listings where ticket_type_id=p_ticket_type and mode='public' and status='active' and seller_id<>v_wait.buyer_id order by created_at for update skip locked limit v_wait.requested_quantity
  loop
    v_ids:=array_append(v_ids,v_listing.id);v_fee:=v_fee+v_listing.fee_cents;v_price:=v_listing.price_cents;
  end loop;
  if cardinality(v_ids)<>v_wait.requested_quantity then return;end if;
  update public.ticket_resale_listings set status='reserved',buyer_id=v_wait.buyer_id,reserved_until=now()+interval '30 minutes',updated_at=now() where id=any(v_ids);
  update public.ticket_resale_waitlist set status='reserved',reserved_listing_ids=v_ids,reserved_until=now()+interval '30 minutes' where id=v_wait.id;
  select op.stripe_account_id,e.title,tt.name into v_org,v_event_title,v_type_name from public.ticket_types tt join public.events e on e.id=tt.event_id left join public.organizer_profiles op on op.profile_id=e.organizer_id where tt.id=p_ticket_type;
  if v_wait.mode='notification' then insert into public.notifications(profile_id,type,payload) values(v_wait.buyer_id,'waitlist_batch_available',jsonb_build_object('waitlist_id',v_wait.id,'quantity',v_wait.requested_quantity,'expires_at',now()+interval '30 minutes'));end if;
  return query select v_wait.id,v_wait.buyer_id,v_wait.requested_quantity,v_wait.mode,v_ids,v_price*v_wait.requested_quantity,v_fee,v_wait.stripe_customer_id,v_wait.stripe_payment_method_id,v_org,v_event_title,v_type_name;
end;
$$;

create or replace function public.attach_waitlist_payment(p_waitlist uuid,p_payment_intent text)
returns void language plpgsql security definer set search_path=public
as $$
declare v_ids uuid[];
begin
  select reserved_listing_ids into v_ids from public.ticket_resale_waitlist where id=p_waitlist and status='reserved' for update;if v_ids is null then raise exception 'waitlist reservation unavailable';end if;
  update public.ticket_resale_listings set stripe_checkout_session_id=p_payment_intent where id=any(v_ids);
end;
$$;

create or replace function public.mark_waitlist_action_required(p_waitlist uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_buyer uuid;
begin
  update public.ticket_resale_waitlist set status='action_required' where id=p_waitlist and status='reserved' returning buyer_id into v_buyer;if not found then raise exception 'waitlist reservation unavailable';end if;
  insert into public.notifications(profile_id,type,payload) values(v_buyer,'waitlist_payment_action_required',jsonb_build_object('waitlist_id',p_waitlist));
end;
$$;

create or replace function public.mark_waitlist_fulfilled(p_waitlist uuid)
returns void language sql security definer set search_path=public
as $$update public.ticket_resale_waitlist set status='fulfilled',fulfilled_at=now(),reserved_until=null where id=p_waitlist$$;

revoke all on function public.list_ticket_for_resale(uuid),public.create_private_ticket_resale(uuid),public.cancel_ticket_resale(uuid),public.join_ticket_resale_waitlist(uuid,integer,boolean),public.leave_ticket_resale_waitlist(uuid),public.get_resale_offer_by_token(text),public.get_ticket_resale_availability(uuid) from public,anon;
grant execute on function public.list_ticket_for_resale(uuid),public.create_private_ticket_resale(uuid),public.cancel_ticket_resale(uuid),public.join_ticket_resale_waitlist(uuid,integer,boolean),public.leave_ticket_resale_waitlist(uuid) to authenticated;
grant execute on function public.get_resale_offer_by_token(text) to anon,authenticated;
grant execute on function public.get_ticket_resale_availability(uuid) to anon,authenticated;
revoke all on function public.reserve_private_ticket_resale(text,uuid),public.attach_resale_checkout(uuid,uuid,text),public.release_resale_reservation(uuid,uuid),public.fulfill_ticket_resale(uuid,text,uuid),public.mark_ticket_resale_refunded(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_private_ticket_resale(text,uuid),public.attach_resale_checkout(uuid,uuid,text),public.release_resale_reservation(uuid,uuid),public.fulfill_ticket_resale(uuid,text,uuid),public.mark_ticket_resale_refunded(uuid,text) to service_role;
revoke all on function public.reserve_public_ticket_resales(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_public_ticket_resales(uuid,uuid,integer) to service_role;
revoke all on function public.activate_auto_pay_waitlist(uuid,uuid,text,text,text),public.reserve_next_waitlist_batch(uuid),public.attach_waitlist_payment(uuid,text),public.mark_waitlist_action_required(uuid),public.mark_waitlist_fulfilled(uuid) from public,anon,authenticated;
grant execute on function public.activate_auto_pay_waitlist(uuid,uuid,text,text,text),public.reserve_next_waitlist_batch(uuid),public.attach_waitlist_payment(uuid,text),public.mark_waitlist_action_required(uuid),public.mark_waitlist_fulfilled(uuid) to service_role;
