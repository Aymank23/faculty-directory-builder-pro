
REVOKE EXECUTE ON FUNCTION public.can_view_canonical_ic(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirmed_author_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_canonical_ic(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirmed_author_count(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_canonical_ic_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_audit_generic() FROM PUBLIC, anon, authenticated;
