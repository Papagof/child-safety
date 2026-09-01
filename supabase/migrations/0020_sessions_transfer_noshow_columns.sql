alter table public.sessions
  add column is_transfer boolean not null default false,
  add column transferred_from_session_id uuid references public.sessions(id),
  add column noshow_flagged boolean not null default false;

alter table public.sessions drop constraint sessions_status_check;
alter table public.sessions add constraint sessions_status_check
  check (status in ('pending_checkin','checked_in','declined','pending_checkout','checked_out','transferred'));
