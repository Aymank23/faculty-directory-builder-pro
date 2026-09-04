CREATE OR REPLACE FUNCTION public.claim_my_faculty_profile(_employee_id text DEFAULT NULL)
RETURNS SETOF public.faculty_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := public.current_app_user_id();
  my_username text;
  target uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT lower(username) INTO my_username FROM public.app_users WHERE user_id = me;

  SELECT f.faculty_id INTO target
  FROM public.faculty_profiles f
  WHERE f.user_id IS NULL
    AND (
      (my_username IS NOT NULL AND lower(coalesce(f.email,'')) = my_username)
      OR (_employee_id IS NOT NULL AND btrim(_employee_id) <> '' AND f.employee_id = btrim(_employee_id))
    )
  ORDER BY f.created_at
  LIMIT 1;

  IF target IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.faculty_profiles SET user_id = me, updated_at = now() WHERE faculty_id = target;
  RETURN QUERY SELECT * FROM public.faculty_profiles WHERE faculty_id = target;
END $$;

REVOKE ALL ON FUNCTION public.claim_my_faculty_profile(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_my_faculty_profile(text) TO authenticated, service_role;