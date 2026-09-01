-- Realtime Authorization: RLS policies on realtime.messages controlling who
-- may subscribe to (receive broadcasts on) each topic. Mirrors canSubscribe()
-- in server/src/realtime.ts exactly. All sends happen server-side from
-- inside security-definer RPCs (which bypass RLS as the owning role), so only
-- SELECT policies are needed here — no client ever calls channel.send() itself.

-- is_thread_participant() is invoked here under the *subscribing client's*
-- role (same reasoning as is_admin()/is_staff_assigned_to_room() elsewhere),
-- so it needs a direct grant, not just internal use from other definer functions.
grant execute on function public.is_thread_participant(uuid) to authenticated;

create policy realtime_messages_select_admin on realtime.messages
  for select
  to authenticated
  using (
    topic = 'admin' and public.is_admin()
  );

create policy realtime_messages_select_room on realtime.messages
  for select
  to authenticated
  using (
    topic like 'room:%'
    and (
      public.is_admin()
      or public.is_staff_assigned_to_room(auth.uid(), substring(topic from 6)::uuid)
    )
  );

create policy realtime_messages_select_guardian on realtime.messages
  for select
  to authenticated
  using (
    topic like 'guardian:%'
    and (
      public.is_admin()
      or substring(topic from 10) = auth.uid()::text
    )
  );

create policy realtime_messages_select_thread on realtime.messages
  for select
  to authenticated
  using (
    topic like 'thread:%'
    and public.is_thread_participant(substring(topic from 8)::uuid)
  );
