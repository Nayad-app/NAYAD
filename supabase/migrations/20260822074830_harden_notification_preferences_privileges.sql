revoke delete,truncate,references,trigger on public.notification_preferences from anon,authenticated;
grant select,insert,update on public.notification_preferences to authenticated;
