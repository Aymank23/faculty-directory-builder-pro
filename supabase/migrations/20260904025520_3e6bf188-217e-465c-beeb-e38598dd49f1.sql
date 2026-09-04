-- 1) Roles
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','hod','faculty');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 2) Link app_users to auth accounts
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS auth_user_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS app_users_auth_user_id_key ON public.app_users(auth_user_id) WHERE auth_user_id IS NOT NULL;

-- 3) Helper functions
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_hod()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'hod');
$$;

CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.app_users WHERE auth_user_id = auth.uid() AND status = 'active' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_department()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department FROM public.app_users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.can_view_faculty(_faculty_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_admin()
      OR EXISTS (
        SELECT 1 FROM public.faculty_profiles f
        WHERE f.faculty_id = _faculty_id
          AND (
            f.user_id = public.current_app_user_id()
            OR (public.is_hod() AND f.department IS NOT DISTINCT FROM public.current_department())
          )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_faculty(_faculty_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_view_faculty(_faculty_id);
$$;

-- 4) Roles table policies
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());