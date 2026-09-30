
-- has_role: a signed-in user may only ask about their own roles (prevents probing other users' roles).
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
     AND (_user_id = auth.uid() OR auth.uid() IS NULL);
$$;

-- confirmed_author_count: only reveals counts for records the caller may see.
CREATE OR REPLACE FUNCTION public.confirmed_author_count(_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN auth.uid() IS NULL OR public.can_view_canonical_ic(_id)
    THEN (SELECT count(*)::int FROM public.ic_authors WHERE canonical_ic_id = _id AND link_status = 'confirmed')
    ELSE 0 END;
$$;

-- claim_my_faculty_profile: employee-ID claims only for profiles with no email on file
-- (profiles with an email can only be claimed by the matching login), and every claim is audited.
CREATE OR REPLACE FUNCTION public.claim_my_faculty_profile(_employee_id text DEFAULT NULL::text)
RETURNS SETOF faculty_profiles LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_app_user_id(); my_username text; target uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT lower(username) INTO my_username FROM public.app_users WHERE user_id = me;
  SELECT f.faculty_id INTO target FROM public.faculty_profiles f
   WHERE f.user_id IS NULL
     AND ((my_username IS NOT NULL AND lower(coalesce(f.email,'')) = my_username)
       OR (_employee_id IS NOT NULL AND btrim(_employee_id) <> '' AND f.employee_id = btrim(_employee_id)
           AND NULLIF(btrim(coalesce(f.email,'')),'') IS NULL))
   ORDER BY f.created_at LIMIT 1;
  IF target IS NULL THEN RETURN; END IF;
  UPDATE public.faculty_profiles SET user_id = me, updated_at = now() WHERE faculty_id = target;
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (me, 'faculty_profile_claimed', 'faculty_profiles', target::text, jsonb_build_object('employee_id', _employee_id));
  RETURN QUERY SELECT * FROM public.faculty_profiles WHERE faculty_id = target;
END $$;
