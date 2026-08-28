create or replace function public.generate_ticket_public_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_index integer;
begin
  loop
    v_code := 'NOC-';
    for v_index in 1..8 loop
      if v_index = 5 then v_code := v_code || '-'; end if;
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::integer, 1);
    end loop;
    exit when not exists(select 1 from public.tickets where public_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.tickets add column public_code text;
update public.tickets set public_code = public.generate_ticket_public_code() where public_code is null;
alter table public.tickets alter column public_code set default public.generate_ticket_public_code();
alter table public.tickets alter column public_code set not null;
alter table public.tickets add constraint tickets_public_code_unique unique(public_code);
alter table public.tickets add constraint tickets_public_code_format check(public_code ~ '^NOC-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$');

create policy "event owners can read tickets"
on public.tickets for select
using(public.is_event_owner(event_id));

revoke all on function public.generate_ticket_public_code() from public, anon, authenticated;
grant execute on function public.generate_ticket_public_code() to service_role;
