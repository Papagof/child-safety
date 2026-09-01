-- Step 7: org-scope the photos bucket. photos_select_children/
-- photos_select_pickup_people's is_admin() branch was unscoped; photos_select_profiles
-- had NO restriction at all beyond "authenticated" today — any signed-in
-- user in any org could read any other org's profile photos.
drop policy if exists photos_select_children on storage.objects;
create policy photos_select_children on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'children'
    and (
      exists (
        select 1 from public.children c
        where c.id::text = (storage.foldername(name))[2] and c.guardian_id = auth.uid()
      )
      or public.staff_has_active_session_for_child_today((storage.foldername(name))[2]::uuid)
      or (
        public.is_admin()
        and exists (
          select 1 from public.children c
          join public.profiles p on p.id = c.guardian_id
          where c.id::text = (storage.foldername(name))[2] and p.org_id = public.get_my_org_id()
        )
      )
    )
  );

drop policy if exists photos_select_pickup_people on storage.objects;
create policy photos_select_pickup_people on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'pickup-people'
    and (
      exists (
        select 1 from public.pickup_people pp
        join public.children c on c.id = pp.child_id
        where pp.id::text = (storage.foldername(name))[2] and c.guardian_id = auth.uid()
      )
      or exists (
        select 1 from public.pickup_people pp
        where pp.id::text = (storage.foldername(name))[2]
          and public.staff_has_active_session_for_child_today(pp.child_id)
      )
      or (
        public.is_admin()
        and exists (
          select 1 from public.pickup_people pp
          join public.children c on c.id = pp.child_id
          join public.profiles p on p.id = c.guardian_id
          where pp.id::text = (storage.foldername(name))[2] and p.org_id = public.get_my_org_id()
        )
      )
    )
  );

drop policy if exists photos_select_profiles on storage.objects;
create policy photos_select_profiles on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = 'profiles'
    and exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[2] and p.org_id = public.get_my_org_id()
    )
  );
