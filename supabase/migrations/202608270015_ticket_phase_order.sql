alter table public.ticket_types add column if not exists position integer not null default 0;

with ranked as (
  select id,row_number() over(partition by event_id order by price_cents,id)-1 as new_position
  from public.ticket_types
)
update public.ticket_types set position=ranked.new_position from ranked where ticket_types.id=ranked.id;

create or replace function public.assign_ticket_phase_position()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.position=0 and exists(select 1 from public.ticket_types where event_id=new.event_id) then
    select coalesce(max(position),-1)+1 into new.position from public.ticket_types where event_id=new.event_id;
  end if;
  return new;
end $$;

drop trigger if exists ticket_phase_position_before_insert on public.ticket_types;
create trigger ticket_phase_position_before_insert before insert on public.ticket_types
for each row execute function public.assign_ticket_phase_position();

create index if not exists ticket_types_event_position_idx on public.ticket_types(event_id,position);

