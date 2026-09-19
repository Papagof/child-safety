-- RFID self-service sign-in/out for secondary-school students who move
-- independently (no guardian handoff at the door, unlike the code-based
-- flow for younger children). This is an ADDITIONAL path alongside the
-- existing request_checkin/request_checkout flow, not a replacement — both
-- write into the same `sessions` table, so reporting/audit/admin dashboards
-- already work unchanged.
--
-- Deliberate, scoped exception to this app's two-sided-confirmation
-- principle: a card tap alone signs a student in/out, with no second person
-- confirming it in the moment. That's the whole point for this age group
-- (self-directed movement), and it's intentionally NOT the model used
-- anywhere else in the app — request_checkin/approve_checkout for younger
-- children are completely untouched.

create table public.rfid_cards (
  id uuid primary key default extensions.gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  child_id uuid not null references public.children(id) on delete cascade,
  card_uid text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (org_id, card_uid)
);

create index rfid_cards_child_id_idx on public.rfid_cards (child_id);

-- Same "RPC-only access" pattern as sessions/organizations — zero direct
-- grants; every read/write goes through a security-definer function below.
alter table public.rfid_cards enable row level security;

-- A per-organization secret a physical reader presents (header, not a URL
-- param) so a leaked/guessed secret only ever exposes one org's readers —
-- mirrors invite_code's shape (regenerable, admin-only visible) but this
-- one authenticates a device, not a person joining at signup.
alter table public.organizations add column rfid_scan_secret text unique default encode(extensions.gen_random_bytes(16), 'hex');

create or replace function public.admin_register_rfid_card(p_child_id uuid, p_card_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid;
  v_card public.rfid_cards;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  v_org_id := public.get_my_org_id();

  if not exists (
    select 1 from public.children c
    join public.profiles p on p.id = c.guardian_id
    where c.id = p_child_id and p.org_id = v_org_id
  ) then
    raise exception 'Child not found';
  end if;

  begin
    insert into public.rfid_cards (org_id, child_id, card_uid)
    values (v_org_id, p_child_id, trim(p_card_uid))
    returning * into v_card;
  exception when unique_violation then
    raise exception 'This card is already registered in your organization';
  end;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'rfid_card_registered', jsonb_build_object('childId', p_child_id, 'cardUid', v_card.card_uid));

  return jsonb_build_object('id', v_card.id, 'cardUid', v_card.card_uid, 'status', v_card.status);
end;
$$;

create or replace function public.admin_set_rfid_card_status(p_card_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  if p_status not in ('active', 'inactive') then raise exception 'Invalid status'; end if;

  update public.rfid_cards
    set status = p_status
    where id = p_card_id and org_id = public.get_my_org_id();
  if not found then raise exception 'Card not found'; end if;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'rfid_card_status_changed', jsonb_build_object('cardId', p_card_id, 'status', p_status));
end;
$$;

create or replace function public.list_rfid_cards()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', rc.id,
      'cardUid', rc.card_uid,
      'status', rc.status,
      'childId', rc.child_id,
      'childName', c.full_name,
      'createdAt', rc.created_at
    ) order by rc.created_at desc)
    from public.rfid_cards rc
    join public.children c on c.id = rc.child_id
    where rc.org_id = public.get_my_org_id()
  ), '[]'::jsonb);
end;
$$;

create or replace function public.get_rfid_scan_secret()
returns text
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return (select rfid_scan_secret from public.organizations where id = public.get_my_org_id());
end;
$$;

create or replace function public.regenerate_rfid_scan_secret()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;

  v_secret := encode(extensions.gen_random_bytes(16), 'hex');
  update public.organizations set rfid_scan_secret = v_secret where id = public.get_my_org_id();

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'admin', 'rfid_scan_secret_regenerated', '{}'::jsonb);

  return v_secret;
end;
$$;

-- The actual toggle logic, shared by both entry points below. Not exposed
-- directly to any client role — internal PL/pgSQL calls between
-- security-definer functions bypass PostgREST's grant check entirely (that
-- check only applies at the /rest/v1/rpc/ HTTP boundary), so both
-- admin_simulate_rfid_scan (JWT-checked) and the future rfid-scan Edge
-- Function (secret-checked, calling this over the service-role connection)
-- can reach it without duplicating the sign-in/out logic.
create or replace function public.record_rfid_scan_internal(p_org_id uuid, p_card_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_card public.rfid_cards;
  v_child public.children;
  v_session public.sessions;
begin
  select * into v_card from public.rfid_cards
    where org_id = p_org_id and card_uid = trim(p_card_uid) and status = 'active';
  if not found then
    return jsonb_build_object('error', 'card_not_recognized');
  end if;

  select * into v_child from public.children where id = v_card.child_id;
  if not found then
    return jsonb_build_object('error', 'student_not_found');
  end if;

  if v_child.default_room_id is null then
    return jsonb_build_object('error', 'no_room_assigned');
  end if;

  select * into v_session from public.sessions
    where child_id = v_child.id and service_date = public.today_service_date() and status = 'checked_in'
    limit 1;

  if found then
    update public.sessions
      set status = 'checked_out', checkout_approved_at = now()
      where id = v_session.id
      returning * into v_session;

    insert into public.audit_log (session_id, actor_role, action, details)
    values (v_session.id, 'system', 'rfid_checkout', jsonb_build_object('cardUid', v_card.card_uid, 'studentName', v_child.full_name));

    perform public.notify_session_update(v_session);
    perform public.create_notification(
      v_child.guardian_id, 'checkout_approved', v_child.full_name || ' has signed out',
      v_child.full_name || ' signed out with their ID card at ' || to_char(now(), 'HH12:MI AM'), v_session.id
    );

    return jsonb_build_object('action', 'checked_out', 'childName', v_child.full_name);
  end if;

  begin
    insert into public.sessions (child_id, room_id, service_date, status, org_id, checkin_requested_at, checkin_accepted_at, created_at)
    values (v_child.id, v_child.default_room_id, public.today_service_date(), 'checked_in', p_org_id, now(), now(), now())
    returning * into v_session;
  exception when unique_violation then
    return jsonb_build_object('error', 'already_active');
  end;

  insert into public.audit_log (session_id, actor_role, action, details)
  values (v_session.id, 'system', 'rfid_checkin', jsonb_build_object('cardUid', v_card.card_uid, 'studentName', v_child.full_name));

  perform public.notify_session_update(v_session);
  perform public.create_notification(
    v_child.guardian_id, 'checkin_accepted', v_child.full_name || ' has signed in',
    v_child.full_name || ' signed in with their ID card at ' || to_char(now(), 'HH12:MI AM'), v_session.id
  );

  return jsonb_build_object('action', 'checked_in', 'childName', v_child.full_name);
end;
$$;

-- Lets an admin test the whole flow from their own browser (typing a card
-- UID) with no reader hardware and without ever handling the shared scan
-- secret client-side — normal JWT + is_admin() is enough here since the
-- caller's own org is already established by their session.
create or replace function public.admin_simulate_rfid_scan(p_card_uid text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_admin() then raise exception 'Not authorized'; end if;
  return public.record_rfid_scan_internal(public.get_my_org_id(), p_card_uid);
end;
$$;

revoke execute on function public.admin_register_rfid_card(uuid, text) from anon, public;
revoke execute on function public.admin_set_rfid_card_status(uuid, text) from anon, public;
revoke execute on function public.list_rfid_cards() from anon, public;
revoke execute on function public.get_rfid_scan_secret() from anon, public;
revoke execute on function public.regenerate_rfid_scan_secret() from anon, public;
revoke execute on function public.admin_simulate_rfid_scan(text) from anon, public;
grant execute on function public.admin_register_rfid_card(uuid, text) to authenticated;
grant execute on function public.admin_set_rfid_card_status(uuid, text) to authenticated;
grant execute on function public.list_rfid_cards() to authenticated;
grant execute on function public.get_rfid_scan_secret() to authenticated;
grant execute on function public.regenerate_rfid_scan_secret() to authenticated;
grant execute on function public.admin_simulate_rfid_scan(text) to authenticated;

-- The real entry point a future hardware reader calls, via the Edge
-- Function (service-role connection) after validating the shared secret —
-- never exposed to anon/authenticated directly, so the secret check can't
-- be bypassed by calling this RPC straight from a browser.
revoke execute on function public.record_rfid_scan_internal(uuid, text) from anon, authenticated, public;
grant execute on function public.record_rfid_scan_internal(uuid, text) to service_role;
