alter table public.events add column if not exists address text;
alter table public.events add constraint events_address_length check (address is null or char_length(address) between 3 and 300);

