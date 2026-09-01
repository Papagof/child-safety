-- A column DEFAULT achieves the same "defaults to caller's org if the
-- client doesn't supply one" behavior as the BEFORE INSERT trigger, but
-- unlike a trigger it's visible to Supabase's type generator, which marks a
-- column with a DEFAULT as optional in the generated Insert type — a plain
-- trigger left org_id looking required, breaking client/src/lib/data.ts's
-- createRoom() at the type level even though it works fine at runtime.
drop trigger if exists rooms_set_org_id on public.rooms;
drop function if exists public.set_room_org_id();

alter table public.rooms alter column org_id set default public.get_my_org_id();
