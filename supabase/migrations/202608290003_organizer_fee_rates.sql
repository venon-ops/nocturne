alter table public.organizer_profiles
  add column primary_fee_bps integer not null default 800 check(primary_fee_bps between 0 and 5000),
  add column resale_fee_bps integer not null default 1000 check(resale_fee_bps between 0 and 5000);

create or replace function public.protect_organizer_fee_rates()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and
     (new.primary_fee_bps<>old.primary_fee_bps or new.resale_fee_bps<>old.resale_fee_bps) then
    raise exception 'fee rates are managed by NOCTURNE';
  end if;
  return new;
end;
$$;

create trigger protect_organizer_fee_rates
before update on public.organizer_profiles
for each row execute function public.protect_organizer_fee_rates();

create or replace function public.set_organizer_fee_rates(p_organizer uuid,p_primary_bps integer,p_resale_bps integer)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'admin required';end if;
  if p_primary_bps not between 0 and 5000 or p_resale_bps not between 0 and 5000 then raise exception 'invalid fee rate';end if;
  update public.organizer_profiles set primary_fee_bps=p_primary_bps,resale_fee_bps=p_resale_bps where profile_id=p_organizer;
  if not found then raise exception 'organizer not found';end if;
end;
$$;

revoke all on function public.set_organizer_fee_rates(uuid,integer,integer) from public,anon;
grant execute on function public.set_organizer_fee_rates(uuid,integer,integer) to authenticated;

create or replace function public.get_event_resale_fee_bps(p_event uuid)
returns integer language sql stable security definer set search_path=public
as $$select op.resale_fee_bps from public.events e join public.organizer_profiles op on op.profile_id=e.organizer_id where e.id=p_event$$;

revoke all on function public.get_event_resale_fee_bps(uuid) from public,anon;
grant execute on function public.get_event_resale_fee_bps(uuid) to authenticated;

create or replace function public.list_ticket_for_resale(p_ticket uuid)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_ticket public.tickets%rowtype;v_listing uuid;v_price integer;v_fee integer;v_seller uuid;
begin
  v_seller:=auth.uid();if v_seller is null then raise exception 'authentication required';end if;
  select t.* into v_ticket from public.tickets t join public.orders o on o.id=t.order_id where t.id=p_ticket and o.buyer_id=v_seller for update of t;
  if not found then raise exception 'ticket not found';end if;
  if v_ticket.status<>'valid' then raise exception 'ticket unavailable';end if;
  if not exists(select 1 from public.events e join public.organizer_profiles op on op.profile_id=e.organizer_id join public.ticket_types tt on tt.id=v_ticket.ticket_type_id where e.id=v_ticket.event_id and tt.sales_cutoff_at>now() and e.status='published' and op.stripe_account_id is not null) then raise exception 'resale closed';end if;
  select tt.price_cents,round(tt.price_cents*op.resale_fee_bps/10000.0) into v_price,v_fee from public.ticket_types tt join public.events e on e.id=tt.event_id join public.organizer_profiles op on op.profile_id=e.organizer_id where tt.id=v_ticket.ticket_type_id;
  if (select stripe_checkout_session_id from public.orders where id=v_ticket.order_id) is null then raise exception 'original payment unavailable';end if;
  insert into public.ticket_resale_listings(ticket_id,ticket_type_id,seller_id,mode,price_cents,fee_cents,seller_refund_cents,status,private_token_hash,original_checkout_session_id,buyer_id,stripe_checkout_session_id,reserved_until,updated_at)
  values(v_ticket.id,v_ticket.ticket_type_id,v_seller,'public',v_price,v_fee,v_price-v_fee,'active',null,(select stripe_checkout_session_id from public.orders where id=v_ticket.order_id),null,null,null,now())
  on conflict(ticket_id) do update set ticket_type_id=excluded.ticket_type_id,seller_id=excluded.seller_id,mode='public',price_cents=excluded.price_cents,fee_cents=excluded.fee_cents,seller_refund_cents=excluded.seller_refund_cents,status='active',private_token_hash=null,original_checkout_session_id=excluded.original_checkout_session_id,buyer_id=null,stripe_checkout_session_id=null,reserved_until=null,updated_at=now()
  returning id into v_listing;
  update public.tickets set status='resale_pending' where id=v_ticket.id;return v_listing;
end;
$$;

create or replace function public.create_private_ticket_resale(p_ticket uuid)
returns text language plpgsql security definer set search_path=public,extensions
as $$
declare v_ticket public.tickets%rowtype;v_price integer;v_fee integer;v_seller uuid;v_token text;
begin
  v_seller:=auth.uid();if v_seller is null then raise exception 'authentication required';end if;
  select t.* into v_ticket from public.tickets t join public.orders o on o.id=t.order_id where t.id=p_ticket and o.buyer_id=v_seller for update of t;
  if not found then raise exception 'ticket not found';end if;
  if v_ticket.status<>'valid' then raise exception 'ticket unavailable';end if;
  if not exists(select 1 from public.events e join public.organizer_profiles op on op.profile_id=e.organizer_id join public.ticket_types tt on tt.id=v_ticket.ticket_type_id where e.id=v_ticket.event_id and tt.sales_cutoff_at>now() and e.status='published' and op.stripe_account_id is not null) then raise exception 'resale closed';end if;
  select tt.price_cents,round(tt.price_cents*op.resale_fee_bps/10000.0) into v_price,v_fee from public.ticket_types tt join public.events e on e.id=tt.event_id join public.organizer_profiles op on op.profile_id=e.organizer_id where tt.id=v_ticket.ticket_type_id;v_token:=encode(gen_random_bytes(24),'hex');
  if (select stripe_checkout_session_id from public.orders where id=v_ticket.order_id) is null then raise exception 'original payment unavailable';end if;
  insert into public.ticket_resale_listings(ticket_id,ticket_type_id,seller_id,mode,price_cents,fee_cents,seller_refund_cents,status,private_token_hash,original_checkout_session_id,updated_at)
  values(v_ticket.id,v_ticket.ticket_type_id,v_seller,'private',v_price,v_fee,v_price-v_fee,'active',encode(digest(v_token,'sha256'),'hex'),(select stripe_checkout_session_id from public.orders where id=v_ticket.order_id),now())
  on conflict(ticket_id) do update set ticket_type_id=excluded.ticket_type_id,seller_id=excluded.seller_id,mode='private',price_cents=excluded.price_cents,fee_cents=excluded.fee_cents,seller_refund_cents=excluded.seller_refund_cents,status='active',private_token_hash=excluded.private_token_hash,original_checkout_session_id=excluded.original_checkout_session_id,buyer_id=null,stripe_checkout_session_id=null,reserved_until=null,updated_at=now();
  update public.tickets set status='resale_pending' where id=v_ticket.id;return v_token;
end;
$$;
