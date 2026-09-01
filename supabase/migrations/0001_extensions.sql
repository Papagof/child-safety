-- Extensions needed by the Shmeera schema: pgcrypto for gen_random_uuid()/gen_random_bytes()
-- (code generation + PK defaults), pg_cron for the urgent-chat-escalation job.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_cron with schema extensions;
