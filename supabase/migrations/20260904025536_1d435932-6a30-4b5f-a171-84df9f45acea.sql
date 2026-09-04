REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_hod() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_app_user_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_department() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_faculty(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_edit_faculty(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_hod() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_app_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_department() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_faculty(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_faculty(uuid) TO authenticated, service_role;