-- Remove every legacy policy on the evidence bucket, then re-create ownership-scoped ones.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (qual ILIKE '%evidence%' OR with_check ILIKE '%evidence%' OR policyname ILIKE '%evidence%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

CREATE POLICY "evidence_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'evidence' AND public.can_view_faculty(NULLIF((storage.foldername(name))[1], '')::uuid));
CREATE POLICY "evidence_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'evidence' AND public.can_edit_faculty(NULLIF((storage.foldername(name))[1], '')::uuid));
CREATE POLICY "evidence_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'evidence' AND public.can_edit_faculty(NULLIF((storage.foldername(name))[1], '')::uuid))
  WITH CHECK (bucket_id = 'evidence' AND public.can_edit_faculty(NULLIF((storage.foldername(name))[1], '')::uuid));
CREATE POLICY "evidence_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'evidence' AND public.can_edit_faculty(NULLIF((storage.foldername(name))[1], '')::uuid));

-- Tighten unclaimed-profile updates: only admins and department heads may touch them.
DROP POLICY IF EXISTS "faculty_profiles_update" ON public.faculty_profiles;
CREATE POLICY "faculty_profiles_update" ON public.faculty_profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR user_id = public.current_app_user_id()
    OR (public.is_hod() AND department IS NOT DISTINCT FROM public.current_department())
  )
  WITH CHECK (
    public.is_admin()
    OR user_id = public.current_app_user_id()
    OR (public.is_hod() AND department IS NOT DISTINCT FROM public.current_department())
  );