-- Daily staff/teacher sign-in and sign-out — presence/attendance tracking,
-- distinct from the child check-in/checkout flow (no child custody is
-- involved here). Self-service by design: a staff member is already
-- authenticated as themselves, so unlike a child's pickup code there is no
-- second person to independently confirm — the two-sided-confirmation
-- principle governs custody handoffs, not a teacher logging their own
-- presence. Applies to every organization (church or school) since org
-- type isn't tracked as data anywhere else in this app; an org that has no
-- use for it simply won't surface it.

create table public.staff_attendance (
  id uuid primary key default extensions.gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  service_date date not null default public.today_service_date(),
  signed_in_at timestamptz not null default now(),
  signed_out_at timestamptz
);

create index staff_attendance_org_date_idx on public.staff_attendance (org_id, service_date);
create index staff_attendance_staff_date_idx on public.staff_attendance (staff_id, service_date);

-- At most one open (not yet signed out) row per staff member — still allows
-- multiple sign-in/out cycles in the same day (e.g. a lunch break), just
-- never two simultaneously-open ones.
create unique index staff_attendance_one_open_per_staff
  on public.staff_attendance (staff_id)
  where (signed_out_at is null);

-- Same "RPC-only access" pattern as sessions/organizations/rfid_cards —
-- zero direct grants; every read/write goes through a function below.
alter table public.staff_attendance enable row level security;

create or replace function public.staff_sign_in()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid := public.get_my_org_id();
  v_row public.staff_attendance;
begin
  if v_org_id is null or not public.is_approved_staff() then
    raise exception 'Not authorized';
  end if;

  begin
    insert into public.staff_attendance (org_id, staff_id)
    values (v_org_id, auth.uid())
    returning * into v_row;
  exception when unique_violation then
    raise exception 'Already signed in';
  end;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'staff', 'staff_signed_in', jsonb_build_object('attendanceId', v_row.id));

  return jsonb_build_object('id', v_row.id, 'signedInAt', v_row.signed_in_at);
end;
$$;

create or replace function public.staff_sign_out()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_row public.staff_attendance;
begin
  if not public.is_approved_staff() then
    raise exception 'Not authorized';
  end if;

  update public.staff_attendance
    set signed_out_at = now()
    where staff_id = auth.uid() and signed_out_at is null
    returning * into v_row;
  if not found then
    raise exception 'Not currently signed in';
  end if;

  insert into public.audit_log (actor_id, actor_role, action, details)
  values (auth.uid(), 'staff', 'staff_signed_out', jsonb_build_object('attendanceId', v_row.id));

  return jsonb_build_object('id', v_row.id, 'signedOutAt', v_row.signed_out_at);
end;
$$;

-- A staff member's own sign-in/out cycles for today, so their dashboard can
-- render "Signed in since 8:02 AM" (or "Signed out at 4:15 PM, sign in
-- again?") correctly on page load, not just immediately after a click.
create or replace function public.get_my_attendance_today()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
begin
  if not public.is_approved_staff() then
    raise exception 'Not authorized';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id,
      'signedInAt', signed_in_at,
      'signedOutAt', signed_out_at
    ) order by signed_in_at)
    from public.staff_attendance
    where staff_id = auth.uid() and service_date = public.today_service_date()
  ), '[]'::jsonb);
end;
$$;

-- Admin-facing attendance report, org-scoped like every other admin
-- list/report RPC (list_staff_accounts, list_audit_log, ...).
create or replace function public.list_staff_attendance(p_from date default null, p_to date default null, p_staff_id uuid default null)
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
      'id', a.id,
      'staffId', a.staff_id,
      'staffName', p.full_name,
      'serviceDate', a.service_date,
      'signedInAt', a.signed_in_at,
      'signedOutAt', a.signed_out_at
    ) order by a.signed_in_at desc)
    from public.staff_attendance a
    join public.profiles p on p.id = a.staff_id
    where a.org_id = public.get_my_org_id()
      and (p_from is null or a.service_date >= p_from)
      and (p_to is null or a.service_date <= p_to)
      and (p_staff_id is null or a.staff_id = p_staff_id)
  ), '[]'::jsonb);
end;
$$;

revoke execute on function public.staff_sign_in() from anon, public;
revoke execute on function public.staff_sign_out() from anon, public;
revoke execute on function public.get_my_attendance_today() from anon, public;
revoke execute on function public.list_staff_attendance(date, date, uuid) from anon, public;
grant execute on function public.staff_sign_in() to authenticated;
grant execute on function public.staff_sign_out() to authenticated;
grant execute on function public.get_my_attendance_today() to authenticated;
grant execute on function public.list_staff_attendance(date, date, uuid) to authenticated;
