create or replace function public.fulfill_checkout(
  p_session_id text,
  p_buyer_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_type public.ticket_types%rowtype;
  v_order_id uuid;
  v_quantity integer;
  v_total integer := 0;
begin
  if p_session_id is null or p_buyer_id is null then raise exception 'Missing checkout metadata'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Invalid checkout items'; end if;
  if exists(select 1 from public.orders where stripe_checkout_session_id=p_session_id) then return; end if;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    if v_quantity<1 then raise exception 'Invalid quantity'; end if;
    select * into v_type from public.ticket_types where id=(v_item->>'ticketTypeId')::uuid for update;
    if not found or v_type.sold_quantity+v_quantity>v_type.quantity then raise exception 'Stock conflict'; end if;
    v_total := v_total + v_type.price_cents*v_quantity;
  end loop;

  insert into public.orders(buyer_id,stripe_checkout_session_id,status,total_cents)
  values(p_buyer_id,p_session_id,'paid',v_total)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_quantity := (v_item->>'quantity')::integer;
    select * into v_type from public.ticket_types where id=(v_item->>'ticketTypeId')::uuid for update;
    update public.ticket_types set sold_quantity=sold_quantity+v_quantity where id=v_type.id;
    insert into public.tickets(order_id,ticket_type_id,event_id)
    select v_order_id,v_type.id,v_type.event_id from generate_series(1,v_quantity);
  end loop;
end;
$$;

revoke all on function public.fulfill_checkout(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fulfill_checkout(text,uuid,jsonb) to service_role;

