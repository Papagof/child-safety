-- Gap found in a full-project audit: two dead-end states that had no
-- automatic recovery, plus spec.md §9's explicit "code-expiring-soon
-- warning" notification, which was never implemented.
--
-- 1) A pending_checkin session whose check-in code expires before staff
--    ever accepts or declines it stays 'pending_checkin' forever — nothing
--    transitions it out. The guardian can't retry: request_checkin's
--    partial unique index blocks a second active session for that child/day
--    while the stale one still counts as active. Only a staff member
--    noticing and manually hitting "Decline" frees it up.
-- 2) The same dead end exists on the other side: a pending_checkout session
--    whose pickup code expires before staff approves it stays
--    'pending_checkout' forever. request_checkout requires status =
--    'checked_in', so the guardian can't generate a fresh pickup code —
--    the family is stuck until an admin notices and runs
--    admin_override_checkout.
--
-- expire_stale_codes() (below) auto-recovers both: an expired pending
-- check-in is auto-declined (identical end state to a staff decline, so no
-- client changes needed — SessionStatus.tsx already renders this), and an
-- expired pending checkout is reverted to 'checked_in' with the stale
-- checkout fields cleared, so "Pick up now" simply works again. Both notify
-- the guardian (durable + realtime) so it isn't silent.
--
-- warn_expiring_codes() is the separate, softer half: notifies the guardian
-- shortly before a still-pending code expires, so they have a chance to get
-- it accepted/approved before the auto-recovery above kicks in. Two boolean
-- columns make each warning fire at most once per code.

alter table public.sessions
  add column checkin_expiry_warned boolean not null default false,
  add column checkout_expiry_warned boolean not null default false;

create or replace function public.expire_stale_codes()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_session public.sessions;
  v_child_name text;
  v_guardian_id uuid;
begin
  -- Never-accepted check-ins. Transfers are excluded: accept_checkin
  -- deliberately never checks a transfer's inherited checkin_code_expires_at
  -- (see 0040_org_scoped_session_rpcs.sql), so a transfer isn't meant to
  -- expire on this clock either.
  for r in
    select id from public.sessions
    where status = 'pending_checkin'
      and not is_transfer
      and checkin_code_expires_at < now()
  loop
    update public.sessions
      set status = 'declined',
          checkin_decline_reason = 'Check-in code expired before staff accepted it'
      where id = r.id
      returning * into v_session;

    select c.full_name, c.guardian_id into v_child_name, v_guardian_id
      from public.children c where c.id = v_session.child_id;

    insert into public.audit_log (session_id, actor_role, action, details)
    values (v_session.id, 'admin', 'checkin_code_expired', '{}'::jsonb);

    perform public.notify_session_update(v_session);
    perform public.create_notification(
      v_guardian_id, 'checkin_code_expired', v_child_name || ' — check-in code expired',
      'Nobody accepted it in time. Generate a new check-in code to try again.', v_session.id
    );
  end loop;

  -- Never-approved pickups: revert to 'checked_in' (child never actually
  -- left custody) and clear the stale checkout fields so request_checkout
  -- can be called again like nothing happened.
  for r in
    select id from public.sessions
    where status = 'pending_checkout'
      and checkout_code_expires_at < now()
  loop
    update public.sessions
      set status = 'checked_in',
          checkout_code = null,
          checkout_code_expires_at = null,
          checkout_requested_at = null,
          checkout_requested_by_type = null,
          checkout_requested_by_id = null,
          checkout_expiry_warned = false
      where id = r.id
      returning * into v_session;

    select c.full_name, c.guardian_id into v_child_name, v_guardian_id
      from public.children c where c.id = v_session.child_id;

    insert into public.audit_log (session_id, actor_role, action, details)
    values (v_session.id, 'admin', 'checkout_code_expired', '{}'::jsonb);

    perform public.notify_session_update(v_session);
    perform public.create_notification(
      v_guardian_id, 'checkout_code_expired', v_child_name || ' — pickup code expired',
      'Nobody approved it in time. Generate a new pickup code to try again.', v_session.id
    );
  end loop;
end;
$$;

revoke execute on function public.expire_stale_codes() from anon, authenticated, public;

create or replace function public.warn_expiring_codes()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  v_child_name text;
  v_guardian_id uuid;
begin
  for r in
    select id from public.sessions
    where status = 'pending_checkin'
      and not is_transfer
      and not checkin_expiry_warned
      and checkin_code_expires_at > now()
      and checkin_code_expires_at < now() + interval '30 minutes'
  loop
    update public.sessions set checkin_expiry_warned = true where id = r.id;

    select c.full_name, c.guardian_id into v_child_name, v_guardian_id
      from public.sessions s join public.children c on c.id = s.child_id where s.id = r.id;

    perform public.create_notification(
      v_guardian_id, 'checkin_code_expiring', v_child_name || ' — check-in code expiring soon',
      'Ask staff to accept it soon, or it will be automatically declined and you''ll need a new one.', r.id
    );
  end loop;

  for r in
    select id from public.sessions
    where status = 'pending_checkout'
      and not checkout_expiry_warned
      and checkout_code_expires_at > now()
      and checkout_code_expires_at < now() + interval '5 minutes'
  loop
    update public.sessions set checkout_expiry_warned = true where id = r.id;

    select c.full_name, c.guardian_id into v_child_name, v_guardian_id
      from public.sessions s join public.children c on c.id = s.child_id where s.id = r.id;

    perform public.create_notification(
      v_guardian_id, 'checkout_code_expiring', v_child_name || ' — pickup code expiring soon',
      'Ask staff to confirm it soon, or you''ll need to generate a new one.', r.id
    );
  end loop;
end;
$$;

revoke execute on function public.warn_expiring_codes() from anon, authenticated, public;

select cron.schedule('expire-stale-codes', '*/5 * * * *', $$select public.expire_stale_codes();$$);
select cron.schedule('warn-expiring-codes', '*/5 * * * *', $$select public.warn_expiring_codes();$$);
