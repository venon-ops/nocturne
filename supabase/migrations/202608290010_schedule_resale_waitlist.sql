create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare
  v_job_id bigint;
begin
  select jobid into v_job_id
  from cron.job
  where jobname = 'process-resale-waitlist-every-minute';

  if v_job_id is not null then
    perform cron.unschedule(v_job_id);
  end if;
end
$$;

select cron.schedule(
  'process-resale-waitlist-every-minute',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://ypbemhhthywxnyqognei.supabase.co/functions/v1/process-resale-waitlist',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'internal_function_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    ) as request_id;
  $job$
);
