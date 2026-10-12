create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
-- No job runs until VAPID keys and scheduler secret have been provisioned.
-- The Vault lookup keeps credentials out of cron.job and source control.
select cron.schedule('nayad-payment-reminders','* * * * *', $job$
 select net.http_post(
   url:='https://kjgtmxcxchjevzoxwqzr.supabase.co/functions/v1/send-payment-reminders',
   headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||((select decrypted_secret::jsonb from vault.decrypted_secrets where name='nayad_web_push_config')->>'cronToken')),
   body:='{}'::jsonb,timeout_milliseconds:=60000
 ) where exists(select 1 from public.push_reminder_settings p join public.web_push_subscriptions s on s.user_id=p.user_id where p.enabled)
 and exists(select 1 from vault.secrets where name='nayad_web_push_config');
$job$);
select cron.schedule('nayad-push-receipt-cleanup','15 3 * * *', $job$
 delete from public.push_delivery_receipts where local_day<current_date-14;
$job$);
