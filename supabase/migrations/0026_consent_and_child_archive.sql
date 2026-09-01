-- Parental/user consent capture at signup (spec.md §6).
alter table public.profiles add column consent_at timestamptz;

create or replace function public.complete_signup(p_role text, p_full_name text, p_phone text default null, p_consent boolean default false)
returns public.profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_role not in ('guardian','staff') then
    raise exception 'Invalid role';
  end if;
  if not p_consent then
    raise exception 'Consent is required to create an account';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile already exists';
  end if;

  insert into public.profiles (id, role, full_name, phone, consent_at)
  values (auth.uid(), p_role, p_full_name, p_phone, now())
  returning * into v_profile;

  if p_role = 'staff' then
    insert into public.staff_details (user_id) values (auth.uid());
  end if;

  return v_profile;
end;
$$;

grant execute on function public.complete_signup(text, text, text, boolean) to authenticated;
-- create or replace can't change an argument list — the old 3-arg overload
-- would otherwise linger alongside this new 4-arg one.
drop function if exists public.complete_signup(text, text, text);

-- Guardian "remove child" control (spec.md §6's "clear controls for a parent
-- to view/export/delete their child's data") is a soft archive, not a hard
-- delete — a hard delete would orphan session/audit history for a child who
-- was actually checked in, which conflicts with the non-negotiable audit
-- trail. archived_at just hides the child from the guardian's active list;
-- filtering happens client-side (client/src/lib/data.ts's myChildren()).
alter table public.children add column archived_at timestamptz;
