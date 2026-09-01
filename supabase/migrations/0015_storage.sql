insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Path convention: children/{child_id}/..., pickup-people/{pickup_person_id}/...,
-- profiles/{user_id}/... — ownership is derivable from the path itself.

create policy photos_insert_children on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'children'
    and exists (
      select 1 from public.children c
      where c.id::text = (storage.foldername(name))[2] and c.guardian_id = auth.uid()
    )
  );

create policy photos_update_children on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'children'
    and exists (
      select 1 from public.children c
      where c.id::text = (storage.foldername(name))[2] and c.guardian_id = auth.uid()
    )
  );

create policy photos_select_children on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'children'
    and (
      public.is_admin()
      or exists (select 1 from public.children c where c.id::text = (storage.foldername(name))[2] and c.guardian_id = auth.uid())
      or public.staff_has_active_session_for_child_today((storage.foldername(name))[2]::uuid)
    )
  );

create policy photos_insert_pickup_people on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'pickup-people'
    and exists (
      select 1 from public.pickup_people pp
      join public.children c on c.id = pp.child_id
      where pp.id::text = (storage.foldername(name))[2] and c.guardian_id = auth.uid()
    )
  );

create policy photos_update_pickup_people on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'pickup-people'
    and exists (
      select 1 from public.pickup_people pp
      join public.children c on c.id = pp.child_id
      where pp.id::text = (storage.foldername(name))[2] and c.guardian_id = auth.uid()
    )
  );

create policy photos_select_pickup_people on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'pickup-people'
    and (
      public.is_admin()
      or exists (
        select 1 from public.pickup_people pp
        join public.children c on c.id = pp.child_id
        where pp.id::text = (storage.foldername(name))[2] and c.guardian_id = auth.uid()
      )
      or exists (
        select 1 from public.pickup_people pp
        where pp.id::text = (storage.foldername(name))[2]
          and public.staff_has_active_session_for_child_today(pp.child_id)
      )
    )
  );

-- Self-photo (guardian or staff) — low sensitivity (a headshot alone, no
-- name/medical context attached), readable by any authenticated user since
-- staff/other-staff/admin all need to see it during pickup verification.
create policy photos_insert_own_profile on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy photos_update_own_profile on storage.objects
  for update to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'profiles'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy photos_select_profiles on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'profiles'
  );
