DROP POLICY IF EXISTS canonical_ics_insert ON public.canonical_ics;
CREATE POLICY canonical_ics_insert ON public.canonical_ics FOR INSERT TO authenticated WITH CHECK (public.is_admin());