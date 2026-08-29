alter table public.tickets add column purchase_price_cents integer;

update public.tickets t
set purchase_price_cents=tt.price_cents
from public.ticket_types tt
where tt.id=t.ticket_type_id and t.purchase_price_cents is null;

alter table public.tickets
  alter column purchase_price_cents set not null,
  add constraint tickets_purchase_price_cents_check check(purchase_price_cents>=0);

create or replace function public.snapshot_ticket_purchase_price()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.purchase_price_cents is null then
    select price_cents into new.purchase_price_cents
    from public.ticket_types where id=new.ticket_type_id;
  end if;
  if new.purchase_price_cents is null then raise exception 'ticket purchase price unavailable';end if;
  return new;
end;
$$;

create trigger snapshot_ticket_purchase_price
before insert on public.tickets
for each row execute function public.snapshot_ticket_purchase_price();
