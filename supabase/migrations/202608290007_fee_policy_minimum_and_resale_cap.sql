alter table public.organizer_profiles
  add column primary_fee_min_cents integer not null default 49 check(primary_fee_min_cents between 0 and 10000),
  add column resale_fee_cap_cents integer not null default 1500 check(resale_fee_cap_cents between 0 and 100000);

alter table public.organizer_profiles alter column primary_fee_bps set default 350;
update public.organizer_profiles set primary_fee_bps=350 where primary_fee_bps=800;

create or replace function public.protect_organizer_fee_rates()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is not null and not public.is_admin() and
     (new.primary_fee_bps<>old.primary_fee_bps or
      new.primary_fee_min_cents<>old.primary_fee_min_cents or
      new.resale_fee_bps<>old.resale_fee_bps or
      new.resale_fee_cap_cents<>old.resale_fee_cap_cents) then
    raise exception 'fee rates are managed by NOCTURNE';
  end if;
  return new;
end;
$$;

drop function if exists public.set_organizer_fee_rates(uuid,integer,integer);
create function public.set_organizer_fee_rates(
  p_organizer uuid,
  p_primary_bps integer,
  p_primary_min_cents integer,
  p_resale_bps integer,
  p_resale_cap_cents integer
)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if not public.is_admin() then raise exception 'admin required';end if;
  if p_primary_bps not between 0 and 5000 or p_resale_bps not between 0 and 5000 or
     p_primary_min_cents not between 0 and 10000 or p_resale_cap_cents not between 0 and 100000 then
    raise exception 'invalid fee policy';
  end if;
  update public.organizer_profiles
  set primary_fee_bps=p_primary_bps,
      primary_fee_min_cents=p_primary_min_cents,
      resale_fee_bps=p_resale_bps,
      resale_fee_cap_cents=p_resale_cap_cents
  where profile_id=p_organizer;
  if not found then raise exception 'organizer not found';end if;
end;
$$;

revoke all on function public.set_organizer_fee_rates(uuid,integer,integer,integer,integer) from public,anon;
grant execute on function public.set_organizer_fee_rates(uuid,integer,integer,integer,integer) to authenticated;

create or replace function public.get_event_resale_fee_policy(p_event uuid)
returns table(fee_bps integer,cap_cents integer)
language sql stable security definer set search_path=public
as $$
  select op.resale_fee_bps,op.resale_fee_cap_cents
  from public.events e
  join public.organizer_profiles op on op.profile_id=e.organizer_id
  where e.id=p_event
$$;

revoke all on function public.get_event_resale_fee_policy(uuid) from public,anon;
grant execute on function public.get_event_resale_fee_policy(uuid) to authenticated;

create or replace function public.enforce_ticket_resale_fee_policy()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_bps integer;v_cap integer;
begin
  select op.resale_fee_bps,op.resale_fee_cap_cents into v_bps,v_cap
  from public.ticket_types tt
  join public.events e on e.id=tt.event_id
  join public.organizer_profiles op on op.profile_id=e.organizer_id
  where tt.id=new.ticket_type_id;
  if not found then raise exception 'organizer fee policy unavailable';end if;
  new.fee_cents:=least(round(new.price_cents*v_bps/10000.0),v_cap);
  new.seller_refund_cents:=new.price_cents-new.fee_cents;
  return new;
end;
$$;

drop trigger if exists enforce_ticket_resale_fee_policy on public.ticket_resale_listings;
create trigger enforce_ticket_resale_fee_policy
before insert or update of price_cents,ticket_type_id,fee_cents,seller_refund_cents on public.ticket_resale_listings
for each row execute function public.enforce_ticket_resale_fee_policy();

update public.ticket_resale_listings
set fee_cents=fee_cents
where status in ('active','reserved');
