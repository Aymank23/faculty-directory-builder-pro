-- Drop all existing restrictive policies and recreate as permissive
DROP POLICY IF EXISTS "Allow all access to app_users" ON public.app_users;
DROP POLICY IF EXISTS "Allow all access to audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Allow all access to follow_ups" ON public.follow_ups;
DROP POLICY IF EXISTS "Allow all access to intervention_forms" ON public.intervention_forms;
DROP POLICY IF EXISTS "Allow all access to outcomes" ON public.outcomes;
DROP POLICY IF EXISTS "Allow all access to risk_cases" ON public.risk_cases;

-- Recreate as permissive policies
CREATE POLICY "Allow all access to app_users" ON public.app_users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to audit_log" ON public.audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to follow_ups" ON public.follow_ups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to intervention_forms" ON public.intervention_forms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to outcomes" ON public.outcomes FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to risk_cases" ON public.risk_cases FOR ALL USING (true) WITH CHECK (true);
