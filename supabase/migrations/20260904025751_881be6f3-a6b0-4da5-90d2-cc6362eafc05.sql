-- Drop the old wide-open policies
DROP POLICY IF EXISTS "Allow all access to academic_qualifications" ON public.academic_qualifications;
DROP POLICY IF EXISTS "Allow all access to app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow all access to audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Allow all access to awards_recognition" ON public.awards_recognition;
DROP POLICY IF EXISTS "Allow all access to cv_uploads" ON public.cv_uploads;
DROP POLICY IF EXISTS "Allow all access to faculty_profiles" ON public.faculty_profiles;
DROP POLICY IF EXISTS "Allow all access to intellectual_contributions" ON public.intellectual_contributions;
DROP POLICY IF EXISTS "Allow all access to professional_engagements" ON public.professional_engagements;
DROP POLICY IF EXISTS "Allow all access to professional_experience" ON public.professional_experience;
DROP POLICY IF EXISTS "Allow all access to service_contributions" ON public.service_contributions;
DROP POLICY IF EXISTS "Allow all access to teaching_load" ON public.teaching_load;

-- Revoke anonymous access everywhere; signed-in + server keep access
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_qualifications','app_users','audit_log','awards_recognition','cv_uploads',
    'faculty_profiles','intellectual_contributions','professional_engagements',
    'professional_experience','service_contributions','teaching_load','user_roles'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_qualifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.awards_recognition TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_uploads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intellectual_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_engagements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.professional_experience TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teaching_load TO authenticated;
GRANT SELECT, UPDATE, DELETE, INSERT ON public.app_users TO authenticated;
GRANT SELECT, INSERT ON public.audit_log TO authenticated;

-- app_users: self or admin
CREATE POLICY "app_users_select" ON public.app_users
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid() OR public.is_admin());
CREATE POLICY "app_users_admin_write" ON public.app_users
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- faculty_profiles
CREATE POLICY "faculty_profiles_select" ON public.faculty_profiles
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR user_id = public.current_app_user_id()
    OR (public.is_hod() AND department IS NOT DISTINCT FROM public.current_department())
  );
CREATE POLICY "faculty_profiles_insert" ON public.faculty_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_hod() OR user_id = public.current_app_user_id());
CREATE POLICY "faculty_profiles_update" ON public.faculty_profiles
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR user_id = public.current_app_user_id()
    OR (public.is_hod() AND department IS NOT DISTINCT FROM public.current_department())
    OR user_id IS NULL
  )
  WITH CHECK (true);
CREATE POLICY "faculty_profiles_delete" ON public.faculty_profiles
  FOR DELETE TO authenticated USING (public.is_admin());

-- Child tables scoped through the faculty record
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'academic_qualifications','awards_recognition','intellectual_contributions',
    'professional_engagements','professional_experience','service_contributions','teaching_load'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY %1$I ON public.%2$I
        FOR SELECT TO authenticated
        USING (public.can_view_faculty(faculty_id));
      CREATE POLICY %3$I ON public.%2$I
        FOR INSERT TO authenticated
        WITH CHECK (public.can_edit_faculty(faculty_id));
      CREATE POLICY %4$I ON public.%2$I
        FOR UPDATE TO authenticated
        USING (public.can_edit_faculty(faculty_id)) WITH CHECK (public.can_edit_faculty(faculty_id));
      CREATE POLICY %5$I ON public.%2$I
        FOR DELETE TO authenticated
        USING (public.can_edit_faculty(faculty_id));
    $f$, t || '_select', t, t || '_insert', t || '_update', t || '_delete');
  END LOOP;
END $$;

-- cv_uploads
CREATE POLICY "cv_uploads_select" ON public.cv_uploads
  FOR SELECT TO authenticated USING (public.can_view_faculty(faculty_id));
CREATE POLICY "cv_uploads_insert" ON public.cv_uploads
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_faculty(faculty_id));
CREATE POLICY "cv_uploads_update" ON public.cv_uploads
  FOR UPDATE TO authenticated USING (public.can_edit_faculty(faculty_id)) WITH CHECK (public.can_edit_faculty(faculty_id));
CREATE POLICY "cv_uploads_delete" ON public.cv_uploads
  FOR DELETE TO authenticated USING (public.is_admin());

-- audit_log: admins read, signed-in users append
CREATE POLICY "audit_log_select" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE POLICY "audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (public.current_app_user_id() IS NOT NULL);

-- Passwords now live in the auth system only
ALTER TABLE public.app_users ALTER COLUMN password_hash DROP NOT NULL;
UPDATE public.app_users SET password_hash = NULL;