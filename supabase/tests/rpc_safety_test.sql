-- Safety-critical regression test for the two things CLAUDE.md calls
-- non-negotiable: two-sided confirmation (a code alone never changes a
-- child's status) and org isolation (an admin can never see/act on another
-- org's data). This project has no local Supabase stack and no CI — every
-- one of these properties has only ever been checked by hand, in a session,
-- against the live database. This file makes that repeatable.
--
-- How to run: paste the whole file into the Studio SQL editor (or run it via
-- the Supabase MCP `execute_sql` tool) against the live project. It is
-- entirely self-contained — one big `do $$ ... $$` block:
--   * Creates disposable, tagged ("ZZTEST") orgs/users/rooms/children.
--   * Impersonates each actor via `set_config('request.jwt.claim.sub', ...)`
--     (the same trick this project's own earlier verification migrations
--     used — see 0027-era `verify_*`/`cleanup_*` migrations in the remote
--     migration history).
--   * Asserts each safety property with `raise exception` on failure.
--   * Deletes every row it created, then prints ALL TESTS PASSED.
--
-- If any assertion fails, the whole `do` block aborts and Postgres rolls
-- back everything inside it automatically — so a failed run leaves zero
-- trace in the database; you just get the exception text naming what broke.
-- Never apply this as a migration (it is not idempotent schema — it is a
-- one-shot assertion run), and never run it against anything but a
-- throwaway/test context if one ever becomes available (see CLAUDE.md's
-- note on why Supabase branching isn't available for this project today).

do $$
declare
  v_org_a uuid;
  v_org_b uuid;
  v_admin_a uuid;
  v_guardian_a uuid;
  v_staff_a uuid;
  v_admin_b uuid;
  v_guardian_b uuid;
  v_staff_b uuid;
  v_room_a1 uuid;
  v_room_b1 uuid;
  v_child_a1 uuid;
  v_child_b1 uuid;
  v_pickup_blocked uuid;
  v_session_a uuid;
  v_session_b uuid;
  v_incident_b uuid;
  v_checkin_code text;
  v_checkout_code text;
  v_result jsonb;
  v_status text;
  v_raised boolean;
  v_count int;
begin
  -------------------------------------------------------------------------
  -- Fixtures: two fully independent orgs, tagged ZZTEST for easy identification.
  -------------------------------------------------------------------------
  insert into public.organizations (name, invite_code, org_type)
  values ('ZZTEST Org A', 'ZZTESTA01', 'church') returning id into v_org_a;
  insert into public.organizations (name, invite_code, org_type)
  values ('ZZTEST Org B', 'ZZTESTB01', 'school') returning id into v_org_b;

  -- auth.users rows (never touched by GoTrue/login — pure SQL impersonation
  -- via request.jwt.claim.sub below, so password/tokens are throwaway).
  v_admin_a := gen_random_uuid(); v_guardian_a := gen_random_uuid(); v_staff_a := gen_random_uuid();
  v_admin_b := gen_random_uuid(); v_guardian_b := gen_random_uuid(); v_staff_b := gen_random_uuid();

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token, email_change_token_new, email_change, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select u.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    u.email, 'x', now(), '', '', '', '', '{}'::jsonb, '{}'::jsonb, now(), now()
  from (values
    (v_admin_a, 'zztest-admin-a@example.invalid'),
    (v_guardian_a, 'zztest-guardian-a@example.invalid'),
    (v_staff_a, 'zztest-staff-a@example.invalid'),
    (v_admin_b, 'zztest-admin-b@example.invalid'),
    (v_guardian_b, 'zztest-guardian-b@example.invalid'),
    (v_staff_b, 'zztest-staff-b@example.invalid')
  ) as u(id, email);

  insert into public.profiles (id, org_id, role, full_name, consent_at) values
    (v_admin_a, v_org_a, 'admin', 'ZZTEST Admin A', now()),
    (v_guardian_a, v_org_a, 'guardian', 'ZZTEST Guardian A', now()),
    (v_staff_a, v_org_a, 'staff', 'ZZTEST Staff A', now()),
    (v_admin_b, v_org_b, 'admin', 'ZZTEST Admin B', now()),
    (v_guardian_b, v_org_b, 'guardian', 'ZZTEST Guardian B', now()),
    (v_staff_b, v_org_b, 'staff', 'ZZTEST Staff B', now());

  insert into public.staff_details (user_id, approval_status) values (v_staff_a, 'approved'), (v_staff_b, 'approved');

  insert into public.rooms (name, org_id, active) values ('ZZTEST Room A1', v_org_a, true) returning id into v_room_a1;
  insert into public.rooms (name, org_id, active) values ('ZZTEST Room B1', v_org_b, true) returning id into v_room_b1;

  insert into public.staff_rooms (staff_id, room_id) values (v_staff_a, v_room_a1), (v_staff_b, v_room_b1);

  insert into public.children (guardian_id, full_name, dob) values (v_guardian_a, 'ZZTEST Child A1', '2015-01-01') returning id into v_child_a1;
  insert into public.children (guardian_id, full_name, dob) values (v_guardian_b, 'ZZTEST Child B1', '2015-01-01') returning id into v_child_b1;

  insert into public.pickup_people (child_id, full_name, relationship, added_by, status, blocked_reason)
  values (v_child_a1, 'ZZTEST Blocked Pickup', 'uncle', v_guardian_a, 'blocked', 'Custody restriction on file')
  returning id into v_pickup_blocked;

  raise notice 'Fixtures created: org A=%, org B=%', v_org_a, v_org_b;

  -------------------------------------------------------------------------
  -- 1. Two-sided confirmation: a wrong code must never change status.
  -------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_guardian_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  v_result := public.request_checkin(v_child_a1, v_room_a1);
  v_session_a := (v_result->'session'->>'id')::uuid;
  select checkin_code, status into v_checkin_code, v_status from public.sessions where id = v_session_a;
  if v_status <> 'pending_checkin' then
    raise exception 'FAIL: request_checkin did not leave session pending_checkin (got %)', v_status;
  end if;
  raise notice 'PASS: request_checkin creates a pending_checkin session, not an already-checked-in one';

  perform set_config('request.jwt.claim.sub', v_staff_a::text, true);
  v_result := public.accept_checkin(v_session_a, 'WRONGCODE');
  select status into v_status from public.sessions where id = v_session_a;
  if v_result->>'error' <> 'code_mismatch' or v_status <> 'pending_checkin' then
    raise exception 'FAIL: accept_checkin with a wrong code did not reject cleanly (result=%, status=%)', v_result, v_status;
  end if;
  if not exists (select 1 from public.audit_log where session_id = v_session_a and action = 'checkin_code_mismatch') then
    raise exception 'FAIL: a mismatched check-in code attempt was not audit-logged';
  end if;
  raise notice 'PASS: a wrong check-in code is rejected and does not check the child in, and is audit-logged';

  v_result := public.accept_checkin(v_session_a, v_checkin_code);
  select status into v_status from public.sessions where id = v_session_a;
  if v_status <> 'checked_in' then
    raise exception 'FAIL: accept_checkin with the real code did not check the child in (status=%)', v_status;
  end if;
  raise notice 'PASS: the real check-in code checks the child in';

  -------------------------------------------------------------------------
  -- 2. Closed pickup list: a blocked pickup person must never get a code.
  -------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_guardian_a::text, true);
  v_result := public.request_checkout(v_session_a, v_pickup_blocked);
  select status into v_status from public.sessions where id = v_session_a;
  if (v_result->>'blocked')::boolean is not true or v_status <> 'checked_in' then
    raise exception 'FAIL: requesting checkout for a blocked pickup person did not block cleanly (result=%, status=%)', v_result, v_status;
  end if;
  raise notice 'PASS: a blocked pickup person is refused a checkout code, child stays checked in';

  -------------------------------------------------------------------------
  -- 3. Cross-org transfer must be rejected (staff_a attempting room_b1).
  -------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_staff_a::text, true);
  v_raised := false;
  begin
    perform public.transfer_session(v_session_a, v_room_b1);
  exception when others then
    v_raised := true;
  end;
  select status into v_status from public.sessions where id = v_session_a;
  if not v_raised then
    raise exception 'FAIL: transfer_session allowed moving a child into another org''s room';
  end if;
  if v_status <> 'checked_in' then
    raise exception 'FAIL: session status changed despite a rejected cross-org transfer (status=%)', v_status;
  end if;
  raise notice 'PASS: transfer_session rejects a destination room belonging to another org';

  -------------------------------------------------------------------------
  -- 4. Finish the checkout flow (wrong code, then real code) on session_a.
  -------------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_guardian_a::text, true);
  v_result := public.request_checkout(v_session_a);
  select checkout_code into v_checkout_code from public.sessions where id = v_session_a;

  perform set_config('request.jwt.claim.sub', v_staff_a::text, true);
  v_result := public.approve_checkout(v_session_a, 'WRONGCODE');
  select status into v_status from public.sessions where id = v_session_a;
  if v_result->>'error' <> 'code_mismatch' or v_status <> 'pending_checkout' then
    raise exception 'FAIL: approve_checkout with a wrong code did not reject cleanly (result=%, status=%)', v_result, v_status;
  end if;
  raise notice 'PASS: a wrong checkout code is rejected and does not release the child';

  v_result := public.approve_checkout(v_session_a, v_checkout_code);
  select status into v_status from public.sessions where id = v_session_a;
  if v_status <> 'checked_out' then
    raise exception 'FAIL: approve_checkout with the real code did not release the child (status=%)', v_status;
  end if;
  raise notice 'PASS: the real checkout code releases the child';

  -- Single-use: the same (now-redeemed) code must never work again.
  v_raised := false;
  begin
    perform public.approve_checkout(v_session_a, v_checkout_code);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL: a checkout code was accepted a second time after the session was already checked out';
  end if;
  raise notice 'PASS: a redeemed checkout code cannot be reused';

  -------------------------------------------------------------------------
  -- 5. Org isolation: admin_a must never see or act on org B's data.
  -------------------------------------------------------------------------
  -- Give org B a checked-in session and an open incident to try to reach.
  perform set_config('request.jwt.claim.sub', v_guardian_b::text, true);
  v_result := public.request_checkin(v_child_b1, v_room_b1);
  v_session_b := (v_result->'session'->>'id')::uuid;
  perform set_config('request.jwt.claim.sub', v_staff_b::text, true);
  perform public.accept_checkin(v_session_b, (select checkin_code from public.sessions where id = v_session_b));
  v_result := public.flag_pickup_mismatch(v_session_b, 'ZZTEST incident');
  v_incident_b := (v_result->>'incidentId')::uuid;

  perform set_config('request.jwt.claim.sub', v_admin_a::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);

  -- `rooms` is the one table the client reads directly via PostgREST (no
  -- wrapping RPC), so its RLS policy is the actual enforcement here — but
  -- execute_sql's connection runs as `postgres` with BYPASSRLS, so a plain
  -- select under that role would see every row regardless of impersonation
  -- and silently prove nothing. `set local role authenticated` makes this
  -- query subject to RLS the same way a real PostgREST request is, while
  -- every RPC call elsewhere in this file is unaffected either way (they're
  -- all security definer, running as their owner regardless of caller role).
  set local role authenticated;
  select count(*) into v_count from public.rooms where id = v_room_b1;
  reset role;
  if v_count <> 0 then
    raise exception 'FAIL: org A''s admin can see org B''s room via a direct select (RLS leak)';
  end if;
  raise notice 'PASS: org A''s admin cannot see org B''s room (rooms RLS)';

  if exists (select 1 from jsonb_array_elements(public.list_sessions()) e where (e->>'id')::uuid = v_session_b) then
    raise exception 'FAIL: list_sessions leaked a session belonging to org B';
  end if;
  raise notice 'PASS: list_sessions does not leak org B''s sessions to org A''s admin';

  if exists (select 1 from jsonb_array_elements(public.list_staff_accounts()) e where (e->>'id')::uuid = v_staff_b) then
    raise exception 'FAIL: list_staff_accounts leaked a staff member belonging to org B';
  end if;
  raise notice 'PASS: list_staff_accounts does not leak org B''s staff to org A''s admin';

  v_raised := false;
  begin
    perform public.admin_override_checkout(v_session_b, 'ZZTEST cross-org probe');
  exception when others then
    v_raised := true;
  end;
  select status into v_status from public.sessions where id = v_session_b;
  if not v_raised then
    raise exception 'FAIL: admin_override_checkout let org A''s admin release a child belonging to org B';
  end if;
  if v_status = 'checked_out' then
    raise exception 'FAIL: org B''s session was checked out despite a rejected cross-org override';
  end if;
  raise notice 'PASS: admin_override_checkout rejects a session belonging to another org';

  v_raised := false;
  begin
    perform public.resolve_incident(v_incident_b);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL: resolve_incident let org A''s admin resolve an incident belonging to org B';
  end if;
  raise notice 'PASS: resolve_incident rejects an incident belonging to another org';

  v_raised := false;
  begin
    perform public.approve_staff(v_staff_b);
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'FAIL: approve_staff let org A''s admin act on a staff account belonging to org B';
  end if;
  raise notice 'PASS: approve_staff rejects a staff id belonging to another org';

  -- The historically worst leak (CLAUDE.md): purge_old_records must never
  -- touch another org's history, even when its cutoff date covers it.
  -- (Direct table update here, not through an RPC — this is just backdating
  -- a fixture to look like old history, not something being tested itself.)
  update public.sessions set status = 'checked_out', checkout_approved_at = now(), service_date = current_date - 365
    where id = v_session_b;

  perform set_config('request.jwt.claim.sub', v_admin_a::text, true);
  perform public.purge_old_records(current_date);
  if not exists (select 1 from public.sessions where id = v_session_b) then
    raise exception 'FAIL: purge_old_records run by org A''s admin deleted a session belonging to org B';
  end if;
  raise notice 'PASS: purge_old_records only ever touches the calling admin''s own org';

  -------------------------------------------------------------------------
  -- Cleanup — only reached if every assertion above passed.
  -------------------------------------------------------------------------
  delete from public.chat_messages where thread_id in (select id from public.chat_threads where session_id in (v_session_a, v_session_b));
  delete from public.chat_threads where session_id in (v_session_a, v_session_b);
  delete from public.incidents where session_id in (v_session_a, v_session_b) or id = v_incident_b;
  delete from public.audit_log where session_id in (v_session_a, v_session_b);
  delete from public.audit_log where actor_id in (v_admin_a, v_guardian_a, v_staff_a, v_admin_b, v_guardian_b, v_staff_b);
  delete from public.sessions where id in (v_session_a, v_session_b);
  delete from public.pickup_people where id = v_pickup_blocked;
  delete from public.children where id in (v_child_a1, v_child_b1);
  delete from public.staff_rooms where staff_id in (v_staff_a, v_staff_b);
  delete from public.staff_details where user_id in (v_staff_a, v_staff_b);
  delete from public.rooms where id in (v_room_a1, v_room_b1);
  delete from public.profiles where id in (v_admin_a, v_guardian_a, v_staff_a, v_admin_b, v_guardian_b, v_staff_b);
  delete from auth.users where id in (v_admin_a, v_guardian_a, v_staff_a, v_admin_b, v_guardian_b, v_staff_b);
  delete from public.organizations where id in (v_org_a, v_org_b);

  raise notice '=== ALL TESTS PASSED, ALL ZZTEST FIXTURES CLEANED UP ===';
end $$;
