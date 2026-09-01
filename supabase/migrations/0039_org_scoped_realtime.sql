-- Step 8: org-scope realtime authorization. The bare 'admin' topic had zero
-- org check — every admin everywhere subscribed to the same literal string.
-- The room:%/guardian:% is_admin() branches and is_thread_participant()'s
-- internal is_admin() branch were unscoped too: an admin from a different
-- org who knew/guessed a guardian's UUID could subscribe to guardian:<id>
-- and receive that guardian's live check-in/pickup codes.

drop policy if exists realtime_messages_select_admin on realtime.messages;
create policy realtime_messages_select_admin on realtime.messages
  for select to authenticated
  using (
    topic like 'admin:%'
    and public.is_admin()
    and substring(topic from 7) = public.get_my_org_id()::text
  );

drop policy if exists realtime_messages_select_room on realtime.messages;
create policy realtime_messages_select_room on realtime.messages
  for select to authenticated
  using (
    topic like 'room:%'
    and (
      public.is_staff_assigned_to_room(auth.uid(), substring(topic from 6)::uuid)
      or (
        public.is_admin()
        and exists (select 1 from public.rooms r where r.id = substring(topic from 6)::uuid and r.org_id = public.get_my_org_id())
      )
    )
  );

drop policy if exists realtime_messages_select_guardian on realtime.messages;
create policy realtime_messages_select_guardian on realtime.messages
  for select to authenticated
  using (
    topic like 'guardian:%'
    and (
      substring(topic from 10) = auth.uid()::text
      or (
        public.is_admin()
        and exists (select 1 from public.profiles p where p.id = substring(topic from 10)::uuid and p.org_id = public.get_my_org_id())
      )
    )
  );

create or replace function public.is_thread_participant(p_thread_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  v_thread public.chat_threads;
begin
  select * into v_thread from public.chat_threads where id = p_thread_id;
  if not found then return false; end if;
  return v_thread.guardian_id = auth.uid()
    or public.is_staff_assigned_to_room(auth.uid(), v_thread.room_id)
    or (public.is_admin() and v_thread.org_id = public.get_my_org_id());
end;
$$;
