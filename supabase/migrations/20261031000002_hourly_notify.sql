-- كل ساعة (الدقيقة 5) يشغّل مُرسل التنبيهات. المفتاح هنا هو المفتاح العام نفسه الموجود في التطبيق.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid) from cron.job where jobname = 'baddilha-notify';
select cron.schedule(
  'baddilha-notify',
  '5 * * * *',
  $$
  select net.http_post(
    url := 'https://wlybsvlkzcdmkeiofglq.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndseWJzdmxremNkbWtlaW9mZ2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0NDM5NjQsImV4cCI6MjEwOTAxOTk2NH0.f88QjUrTYdj3sCI0OWJm4oP8vsuZ7nXPjUcpKRyi-ow'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
