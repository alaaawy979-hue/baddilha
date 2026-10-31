-- كل ساعة (الدقيقة 5) يشغّل مُرسل التنبيهات. المفتاح هنا هو المفتاح العام نفسه الموجود في التطبيق.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'baddilha-notify';
select cron.schedule(
  'baddilha-notify',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://ptaozrnoqaqmcwgxkegi.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0YW96cm5vcWFxbWN3Z3hrZWdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NDMwODQsImV4cCI6MjEwOTAxOTA4NH0.R4NeS-by0oolwJDgjPkK0Ph0Z0WF8dIE7nJSc-9bl_o'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
