create table public.push_device_tokens(
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check(platform in ('ios','android')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

alter table public.push_device_tokens enable row level security;
create policy "own push tokens" on public.push_device_tokens for select using(profile_id=auth.uid());
create policy "own push tokens delete" on public.push_device_tokens for delete using(profile_id=auth.uid());

create or replace function public.register_expo_push_token(p_token text,p_platform text)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'authentication required';end if;
  if (not starts_with(p_token,'ExponentPushToken[') and not starts_with(p_token,'ExpoPushToken[')) or right(p_token,1)<>']' then raise exception 'invalid expo push token';end if;
  if p_platform not in ('ios','android') then raise exception 'invalid platform';end if;
  insert into public.push_device_tokens(profile_id,expo_push_token,platform,active,last_seen_at)
  values(auth.uid(),p_token,p_platform,true,now())
  on conflict(expo_push_token) do update set profile_id=auth.uid(),platform=excluded.platform,active=true,last_seen_at=now();
end;
$$;

revoke all on function public.register_expo_push_token(text,text) from public,anon;
grant execute on function public.register_expo_push_token(text,text) to authenticated;

create or replace function public.dispatch_native_push_notification()
returns trigger language plpgsql security definer set search_path=public,extensions
as $$
begin
  perform net.http_post(
    url:='https://ypbemhhthywxnyqognei.supabase.co/functions/v1/send-push-notification',
    headers:=jsonb_build_object('Content-Type','application/json','x-internal-secret',(select decrypted_secret from vault.decrypted_secrets where name='internal_function_secret' limit 1)),
    body:=jsonb_build_object('notificationId',new.id),
    timeout_milliseconds:=10000
  );
  return new;
end;
$$;

create trigger dispatch_native_push_notification
after insert on public.notifications
for each row execute function public.dispatch_native_push_notification();
