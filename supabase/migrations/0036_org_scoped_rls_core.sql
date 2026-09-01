-- Step 5: org-scope profiles/rooms RLS. rooms_select_all is the single
-- biggest leak in the whole retrofit — today it's `using (true)`, meaning
-- every authenticated user of any role sees every room in every org.
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (public.is_admin() and org_id = public.get_my_org_id());

drop policy if exists rooms_select_all on public.rooms;
create policy rooms_select_all on public.rooms
  for select using (org_id = public.get_my_org_id());

drop policy if exists rooms_admin_insert on public.rooms;
create policy rooms_admin_insert on public.rooms
  for insert with check (public.is_admin() and org_id = public.get_my_org_id());

drop policy if exists rooms_admin_update on public.rooms;
create policy rooms_admin_update on public.rooms
  for update using (public.is_admin() and org_id = public.get_my_org_id())
  with check (public.is_admin() and org_id = public.get_my_org_id());

-- rooms is the one table inserted directly by the client via PostgREST (no
-- wrapping RPC) — default org_id from the caller so client code inserting a
-- room doesn't need to change; the WITH CHECK above still enforces it as
-- defense in depth against a client that supplies a mismatched org_id.
--
-- NOTE: this trigger was superseded by a plain column DEFAULT in
-- 0047_rooms_org_id_default_instead_of_trigger.sql — a DEFAULT achieves the
-- same "fill in from caller if omitted" behavior AND is visible to
-- Supabase's TypeScript type generator (a trigger isn't, which left org_id
-- looking required in the generated Insert type). Kept here for history.
create or replace function public.set_room_org_id()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.org_id is null then
    new.org_id := public.get_my_org_id();
  end if;
  return new;
end;
$$;

revoke execute on function public.set_room_org_id() from anon, authenticated;

create trigger rooms_set_org_id
  before insert on public.rooms
  for each row execute function public.set_room_org_id();
