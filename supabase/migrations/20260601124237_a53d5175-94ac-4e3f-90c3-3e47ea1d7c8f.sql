ALTER TABLE public.faculty_profiles ADD COLUMN IF NOT EXISTS discipline text;

CREATE OR REPLACE FUNCTION public.canonical_discipline(v text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE upper(btrim(coalesce(v,'')))
    WHEN '' THEN NULL
    WHEN 'MGT' THEN 'MGT'
    WHEN 'MANAGEMENT' THEN 'MGT'
    WHEN 'ECO' THEN 'ECO'
    WHEN 'ECON' THEN 'ECO'
    WHEN 'ECONOMICS' THEN 'ECO'
    WHEN 'FIN' THEN 'FIN'
    WHEN 'FINA' THEN 'FIN'
    WHEN 'FINANCE' THEN 'FIN'
    WHEN 'MKT' THEN 'MKT'
    WHEN 'MARKETING' THEN 'MKT'
    WHEN 'ACC' THEN 'ACC'
    WHEN 'ACCT' THEN 'ACC'
    WHEN 'ACCOUNTING' THEN 'ACC'
    WHEN 'ACC & FIN' THEN 'ACC & FIN'
    WHEN 'ACC&FIN' THEN 'ACC & FIN'
    WHEN 'ACC AND FIN' THEN 'ACC & FIN'
    WHEN 'HTM' THEN 'HTM'
    WHEN 'HOSPITALITY' THEN 'HTM'
    WHEN 'ITM' THEN 'ITM'
    WHEN 'ITOM' THEN 'ITM'
    WHEN 'IT' THEN 'ITM'
    ELSE btrim(v)
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_normalize_faculty_profile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.department := public.canonical_department(NEW.department);
  NEW.ft_pt_status := public.canonical_ft_pt(NEW.ft_pt_status);
  NEW.discipline := public.canonical_discipline(NEW.discipline);
  RETURN NEW;
END $$;