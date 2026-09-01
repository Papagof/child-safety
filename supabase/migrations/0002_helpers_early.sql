-- Pure utility functions with no table dependencies, needed by later migrations.

-- Single source of truth for "today" used by check-in dedup and live dashboards.
-- UTC, matching the current SQLite app's ISO-date behavior (confirmed with user).
create or replace function public.today_service_date()
returns date
language sql
stable
set search_path = public, extensions
as $$
  select (now() at time zone 'utc')::date;
$$;

-- 6-char codes from an alphabet that excludes visually-ambiguous characters
-- (0/O, 1/I/L), cryptographically random via pgcrypto — ports server/src/codes.ts.
create or replace function public.generate_code(p_length int default 6)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  bytes bytea := extensions.gen_random_bytes(p_length);
  i int;
begin
  for i in 0..p_length - 1 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.age_from_dob(p_dob date)
returns int
language sql
stable
set search_path = public, extensions
as $$
  select extract(year from age(current_date, p_dob))::int;
$$;
