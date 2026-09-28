DROP POLICY IF EXISTS canonical_ics_select ON public.canonical_ics;
CREATE POLICY canonical_ics_select ON public.canonical_ics FOR SELECT TO authenticated
  USING (public.can_view_canonical_ic(id) OR created_by = public.current_app_user_id());