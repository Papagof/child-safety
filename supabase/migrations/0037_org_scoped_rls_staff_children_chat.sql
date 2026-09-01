-- Step 6: org-scope the remaining admin-facing SELECT policies. staff_details/
-- staff_rooms/children/pickup_people have no org_id column (deliberately —
-- each is one hop from profiles.org_id via user_id/staff_id/guardian_id), so
-- their admin policy joins to profiles instead. audit_log/incidents/
-- chat_threads/chat_messages have a direct org_id column.

drop policy if exists staff_details_select_admin on public.staff_details;
create policy staff_details_select_admin on public.staff_details
  for select using (
    public.is_admin()
    and exists (select 1 from public.profiles p where p.id = staff_details.user_id and p.org_id = public.get_my_org_id())
  );

drop policy if exists staff_rooms_select_admin on public.staff_rooms;
create policy staff_rooms_select_admin on public.staff_rooms
  for select using (
    public.is_admin()
    and exists (select 1 from public.profiles p where p.id = staff_rooms.staff_id and p.org_id = public.get_my_org_id())
  );

drop policy if exists children_select_admin on public.children;
create policy children_select_admin on public.children
  for select using (
    public.is_admin()
    and exists (select 1 from public.profiles p where p.id = children.guardian_id and p.org_id = public.get_my_org_id())
  );

drop policy if exists pickup_people_select_admin on public.pickup_people;
create policy pickup_people_select_admin on public.pickup_people
  for select using (
    public.is_admin()
    and exists (
      select 1 from public.children c
      join public.profiles p on p.id = c.guardian_id
      where c.id = pickup_people.child_id and p.org_id = public.get_my_org_id()
    )
  );

drop policy if exists audit_log_select_admin on public.audit_log;
create policy audit_log_select_admin on public.audit_log
  for select using (public.is_admin() and org_id = public.get_my_org_id());

drop policy if exists incidents_select_admin on public.incidents;
create policy incidents_select_admin on public.incidents
  for select using (public.is_admin() and org_id = public.get_my_org_id());

drop policy if exists chat_threads_select_participant on public.chat_threads;
create policy chat_threads_select_participant on public.chat_threads
  for select using (
    guardian_id = auth.uid()
    or public.is_staff_assigned_to_room(auth.uid(), room_id)
    or (public.is_admin() and org_id = public.get_my_org_id())
  );

drop policy if exists chat_messages_select_participant on public.chat_messages;
create policy chat_messages_select_participant on public.chat_messages
  for select using (
    exists (
      select 1 from public.chat_threads t
      where t.id = chat_messages.thread_id
        and (
          t.guardian_id = auth.uid()
          or public.is_staff_assigned_to_room(auth.uid(), t.room_id)
          or (public.is_admin() and chat_messages.org_id = public.get_my_org_id())
        )
    )
  );

-- audit_log is written by ~27 call sites across the whole app; rather than
-- touch every one of them just to add one column, derive org_id on insert
-- from actor_id's profile (falling back to session_id's org for the two
-- cron jobs that log with no actor). Raises rather than silently inserting
-- a wrong/null org if neither resolves — verified every existing insert
-- site sets at least one of the two columns, so this can never actually fire.
create or replace function public.set_audit_log_org_id()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.org_id is null and new.actor_id is not null then
    select org_id into new.org_id from public.profiles where id = new.actor_id;
  end if;
  if new.org_id is null and new.session_id is not null then
    select org_id into new.org_id from public.sessions where id = new.session_id;
  end if;
  if new.org_id is null then
    raise exception 'Could not determine org_id for audit_log row (actor_id=%, session_id=%)', new.actor_id, new.session_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.set_audit_log_org_id() from anon, authenticated;

create trigger audit_log_set_org_id
  before insert on public.audit_log
  for each row execute function public.set_audit_log_org_id();
