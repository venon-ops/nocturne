create or replace function public.update_event_with_phases(
  p_event_id uuid,
  p_title text,
  p_city text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_max_capacity integer,
  p_ticket_phases jsonb,
  p_description text default null,
  p_genre text default null,
  p_publication text default 'draft',
  p_publish_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase jsonb;
  v_id uuid;
  v_quantity integer;
  v_total integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.events where id=p_event_id and (organizer_id=auth.uid() or public.is_admin())) then raise exception 'Event not found or forbidden'; end if;
  if p_ends_at <= p_starts_at then raise exception 'Event end must be after its start'; end if;
  if p_max_capacity <= 0 then raise exception 'Maximum capacity must be positive'; end if;
  if jsonb_typeof(p_ticket_phases) <> 'array' or jsonb_array_length(p_ticket_phases)=0 then raise exception 'At least one ticket phase is required'; end if;
  select coalesce(sum((value->>'quantity')::integer),0) into v_total from jsonb_array_elements(p_ticket_phases);
  if v_total > p_max_capacity then raise exception 'Ticket phases exceed event maximum capacity'; end if;

  if exists (
    select 1 from public.ticket_types t
    where t.event_id=p_event_id and t.sold_quantity>0
      and not exists (
        select 1 from jsonb_array_elements(p_ticket_phases) phase
        where nullif(phase->>'id','')::uuid=t.id
      )
  ) then raise exception 'A phase with sales cannot be deleted'; end if;

  -- Temporarily raise the ceiling before phase updates; the final validated value is set below.
  update public.event_private_settings
  set max_capacity=greatest(
    max_capacity,
    p_max_capacity,
    v_total + coalesce((select sum(quantity) from public.ticket_types where event_id=p_event_id),0)
  )
  where event_id=p_event_id;

  delete from public.ticket_types t
  where t.event_id=p_event_id and not exists (
    select 1 from jsonb_array_elements(p_ticket_phases) phase
    where nullif(phase->>'id','')::uuid=t.id
  );

  for v_phase in select value from jsonb_array_elements(p_ticket_phases)
  loop
    v_id := nullif(v_phase->>'id','')::uuid;
    v_quantity := (v_phase->>'quantity')::integer;
    if v_quantity<=0 or (v_phase->>'price_cents')::integer<0 or char_length(trim(v_phase->>'name'))<1 then raise exception 'Invalid ticket phase'; end if;
    if v_id is null then
      insert into public.ticket_types(event_id,name,price_cents,quantity)
      values(p_event_id,trim(v_phase->>'name'),(v_phase->>'price_cents')::integer,v_quantity);
    else
      update public.ticket_types
      set name=trim(v_phase->>'name'), price_cents=(v_phase->>'price_cents')::integer, quantity=v_quantity
      where id=v_id and event_id=p_event_id and v_quantity>=sold_quantity;
      if not found then raise exception 'Invalid phase or quantity below sold count'; end if;
    end if;
  end loop;

  update public.event_private_settings set max_capacity=p_max_capacity,updated_at=now() where event_id=p_event_id;
  update public.events set title=trim(p_title),city=trim(p_city),starts_at=p_starts_at,ends_at=p_ends_at,
    description=nullif(trim(p_description),''),genre=nullif(trim(p_genre),''),
    status=case when p_publication='now' then 'published'::public.event_status else 'draft'::public.event_status end,
    publish_at=case when p_publication='scheduled' then p_publish_at else null end
  where id=p_event_id;
  if p_publication='scheduled' and (p_publish_at is null or p_publish_at<=now()) then raise exception 'Publication date must be in the future'; end if;
end;
$$;

create or replace function public.cancel_event(p_event_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  update public.events set status='cancelled',publish_at=null
  where id=p_event_id and (organizer_id=auth.uid() or public.is_admin());
  if not found then raise exception 'Event not found or forbidden'; end if;
end $$;

create or replace function public.duplicate_event(p_event_id uuid,p_new_slug text)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_new_id uuid;
begin
  if p_new_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then raise exception 'Invalid slug'; end if;
  insert into public.events(organizer_id,venue_id,slug,title,description,starts_at,ends_at,city,genre,cover_path,status)
  select auth.uid(),venue_id,p_new_slug,title||' — copie',description,starts_at,ends_at,city,genre,cover_path,'draft'
  from public.events where id=p_event_id and (organizer_id=auth.uid() or public.is_admin()) returning id into v_new_id;
  if v_new_id is null then raise exception 'Event not found or forbidden'; end if;
  insert into public.event_private_settings(event_id,max_capacity) select v_new_id,max_capacity from public.event_private_settings where event_id=p_event_id;
  insert into public.ticket_types(event_id,name,price_cents,currency,quantity,sale_starts_at,sale_ends_at)
  select v_new_id,name,price_cents,currency,quantity,sale_starts_at,sale_ends_at from public.ticket_types where event_id=p_event_id;
  insert into public.artist_name_mentions(event_id,normalized_name,submitted_name,tagged_by,artist_page_id)
  select v_new_id,normalized_name,submitted_name,auth.uid(),artist_page_id from public.artist_name_mentions where event_id=p_event_id;
  return v_new_id;
end $$;

revoke all on function public.update_event_with_phases(uuid,text,text,timestamptz,timestamptz,integer,jsonb,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.update_event_with_phases(uuid,text,text,timestamptz,timestamptz,integer,jsonb,text,text,text,timestamptz) to authenticated;
revoke all on function public.cancel_event(uuid) from public,anon,authenticated;
grant execute on function public.cancel_event(uuid) to authenticated;
revoke all on function public.duplicate_event(uuid,text) from public,anon,authenticated;
grant execute on function public.duplicate_event(uuid,text) to authenticated;
