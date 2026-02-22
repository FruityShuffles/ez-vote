-- PREREQUISITE (manual): Supabase Dashboard → Database → Extensions → enable pg_cron
select cron.schedule(
  'delete-old-elections',
  '0 3 * * *',
  $$ delete from public.elections where created_at < now() - interval '60 days'; $$
);
