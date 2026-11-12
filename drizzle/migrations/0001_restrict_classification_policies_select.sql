DROP POLICY IF EXISTS "classification_policies_select" ON public.classification_policies;
CREATE POLICY "classification_policies_select" ON public.classification_policies
FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_hod());