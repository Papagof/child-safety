-- Runs every minute so escalation fires within ~60s of the 2-minute
-- threshold, matching spec.md §5's "short window (configurable, e.g. 2-3 min)".
select cron.schedule(
  'escalate-urgent-messages',
  '*/1 * * * *',
  $$select public.escalate_unread_urgent_messages();$$
);
