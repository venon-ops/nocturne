alter table public.ticket_types
  add column entry_cutoff_at timestamptz,
  add column rollover_to_ticket_type_id uuid references public.ticket_types(id) on delete set null,
  add column rollover_processed_at timestamptz;
alter table public.ticket_types drop constraint ticket_types_quantity_check;
alter table public.ticket_types add constraint ticket_types_quantity_check check(quantity>=0);

create table public.ticket_phase_rollovers(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  source_ticket_type_id uuid not null references public.ticket_types(id),
  target_ticket_type_id uuid not null references public.ticket_types(id),
  transferred_quantity integer not null check(transferred_quantity>=0),
  processed_at timestamptz not null default now()
);
alter table public.ticket_phase_rollovers enable row level security;
create policy "event owners read phase rollovers" on public.ticket_phase_rollovers for select to authenticated using(public.is_event_owner(event_id) or public.is_admin());

create or replace function public.default_event_sales_cutoff(p_starts_at timestamptz)
returns timestamptz language sql immutable set search_path=public
as $$select (date_trunc('day',p_starts_at at time zone 'Europe/Paris')+interval '1 day 3 hours') at time zone 'Europe/Paris'$$;

update public.ticket_types tt set sales_cutoff_at=public.default_event_sales_cutoff(e.starts_at) from public.events e where e.id=tt.event_id and tt.sales_cutoff_at is null;
alter table public.ticket_types alter column sales_cutoff_at set not null;

create or replace function public.apply_ticket_phase_default_cutoff()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if new.sales_cutoff_at is null then select public.default_event_sales_cutoff(starts_at) into new.sales_cutoff_at from public.events where id=new.event_id;end if;
  return new;
end
$$;
create trigger ticket_phase_default_cutoff before insert on public.ticket_types for each row execute function public.apply_ticket_phase_default_cutoff();

create or replace function public.enforce_ticket_entry_cutoff()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  if exists(select 1 from public.tickets t join public.ticket_types tt on tt.id=t.ticket_type_id where t.id=new.ticket_id and tt.entry_cutoff_at is not null and new.scanned_at>tt.entry_cutoff_at) then raise exception 'entry cutoff passed';end if;
  return new;
end
$$;
create trigger enforce_checkin_entry_cutoff before insert on public.check_ins for each row execute function public.enforce_ticket_entry_cutoff();

drop function if exists public.get_offline_ticket_manifest(uuid);
create function public.get_offline_ticket_manifest(p_event uuid)
returns table(ticket_hash text,ticket_id uuid,public_code text,attendee_name text,ticket_status public.ticket_status,entry_cutoff_at timestamptz)
language plpgsql security definer set search_path=public,extensions
as $$
begin
  if not public.can_scan_event(p_event) then raise exception 'not authorized';end if;
  return query select encode(digest(t.qr_token::text,'sha256'),'hex'),t.id,t.public_code,t.attendee_name,t.status,tt.entry_cutoff_at from public.tickets t join public.ticket_types tt on tt.id=t.ticket_type_id where t.event_id=p_event;
end
$$;
revoke all on function public.get_offline_ticket_manifest(uuid) from public,anon;
grant execute on function public.get_offline_ticket_manifest(uuid) to authenticated;

create or replace function public.configure_ticket_phase_rules(p_event uuid,p_rules jsonb)
returns void language plpgsql security definer set search_path=public
as $$
declare v_rule jsonb;v_id uuid;v_target uuid;v_sales_cutoff timestamptz;v_entry_cutoff timestamptz;
begin
  if not public.is_event_owner(p_event) and not public.is_admin() then raise exception 'event not found or forbidden';end if;
  if jsonb_typeof(p_rules)<>'array' then raise exception 'invalid phase rules';end if;
  for v_rule in select value from jsonb_array_elements(p_rules)
  loop
    v_id:=(v_rule->>'id')::uuid;v_target:=nullif(v_rule->>'rollover_to_ticket_type_id','')::uuid;v_sales_cutoff:=(v_rule->>'sales_cutoff_at')::timestamptz;v_entry_cutoff:=nullif(v_rule->>'entry_cutoff_at','')::timestamptz;
    if not exists(select 1 from public.ticket_types where id=v_id and event_id=p_event) then raise exception 'invalid source phase';end if;
    if v_target is not null and (v_target=v_id or not exists(select 1 from public.ticket_types where id=v_target and event_id=p_event)) then raise exception 'invalid rollover target';end if;
    if v_target is not null and not exists(select 1 from public.ticket_types where id=v_target and sales_cutoff_at>v_sales_cutoff) then raise exception 'rollover target closes too early';end if;
    if v_entry_cutoff is not null and v_sales_cutoff>v_entry_cutoff then raise exception 'sales cutoff must precede entry cutoff';end if;
    update public.ticket_types set sales_cutoff_at=v_sales_cutoff,entry_cutoff_at=v_entry_cutoff,rollover_to_ticket_type_id=v_target,rollover_processed_at=null where id=v_id;
  end loop;
end
$$;

create or replace function public.rollover_expired_ticket_phase_capacity(p_event uuid)
returns integer language plpgsql security definer set search_path=public
as $$
declare v_source public.ticket_types%rowtype;v_remaining integer;v_total integer:=0;
begin
  for v_source in select * from public.ticket_types where event_id=p_event and rollover_to_ticket_type_id is not null and rollover_processed_at is null and sales_cutoff_at<=now() order by sales_cutoff_at,id for update
  loop
    perform 1 from public.ticket_types where id=v_source.rollover_to_ticket_type_id and event_id=p_event for update;
    v_remaining:=greatest(0,v_source.quantity-v_source.sold_quantity);
    update public.ticket_types set quantity=sold_quantity,rollover_processed_at=now() where id=v_source.id;
    if v_remaining>0 then update public.ticket_types set quantity=quantity+v_remaining where id=v_source.rollover_to_ticket_type_id;end if;
    insert into public.ticket_phase_rollovers(event_id,source_ticket_type_id,target_ticket_type_id,transferred_quantity) values(p_event,v_source.id,v_source.rollover_to_ticket_type_id,v_remaining);
    v_total:=v_total+v_remaining;
  end loop;
  return v_total;
end
$$;

create or replace function public.refresh_public_ticket_phase_capacity(p_event uuid)
returns integer language plpgsql security definer set search_path=public
as $$
begin
  if not exists(select 1 from public.events where id=p_event and (status='published' or (status='draft' and publish_at<=now()))) then return 0;end if;
  return public.rollover_expired_ticket_phase_capacity(p_event);
end
$$;

revoke all on function public.default_event_sales_cutoff(timestamptz),public.configure_ticket_phase_rules(uuid,jsonb),public.rollover_expired_ticket_phase_capacity(uuid) from public,anon,authenticated;
grant execute on function public.configure_ticket_phase_rules(uuid,jsonb) to authenticated;
grant execute on function public.rollover_expired_ticket_phase_capacity(uuid) to service_role;
revoke all on function public.refresh_public_ticket_phase_capacity(uuid) from public;
grant execute on function public.refresh_public_ticket_phase_capacity(uuid) to anon,authenticated;
