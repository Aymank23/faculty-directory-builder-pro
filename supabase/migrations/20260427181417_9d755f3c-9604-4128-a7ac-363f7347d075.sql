-- =========================================================================
-- END-TO-END INTEGRITY MIGRATION
-- =========================================================================

-- 0) Shared text-noise check ---------------------------------------------
CREATE OR REPLACE FUNCTION public.is_cv_noise(v text)
RETURNS boolean LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT
    v IS NULL
    OR btrim(v) = ''
    OR lower(btrim(v)) IN ('—','-','n/a','na','none','null','choose an item','click or tap here','click or tap here to enter text.','click or tap here to enter a date.')
    OR v ~* 'listed\s+from\s+most\s+recent'
    OR v ~* 'most\s+recent\s+to\s+last'
    OR v ~* '^[\(\[].*listed.*[\)\]]$'
    OR v ~* 'click\s+or\s+tap\s+here'
    OR v ~* 'choose\s+an\s+item';
$$;

CREATE OR REPLACE FUNCTION public.clean_cv(v text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE WHEN public.is_cv_noise(v) THEN NULL ELSE btrim(v) END;
$$;

-- 1) Canonical normalization ---------------------------------------------
CREATE OR REPLACE FUNCTION public.canonical_department(v text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(coalesce(v,'')))
    WHEN '' THEN NULL
    WHEN 'econ' THEN 'Economics'
    WHEN 'economics' THEN 'Economics'
    WHEN 'fina' THEN 'Finance and Accounting'
    WHEN 'finance' THEN 'Finance and Accounting'
    WHEN 'finance and accounting' THEN 'Finance and Accounting'
    WHEN 'accounting' THEN 'Finance and Accounting'
    WHEN 'mkt' THEN 'Marketing'
    WHEN 'marketing' THEN 'Marketing'
    WHEN 'mgt' THEN 'Management'
    WHEN 'mgmt' THEN 'Management'
    WHEN 'management' THEN 'Management'
    WHEN 'itom' THEN 'Information Technology and Operations Management'
    WHEN 'it' THEN 'Information Technology and Operations Management'
    WHEN 'information technology' THEN 'Information Technology and Operations Management'
    WHEN 'information technology and operations management' THEN 'Information Technology and Operations Management'
    WHEN 'htm' THEN 'Hospitality and Tourism Management'
    WHEN 'hospitality' THEN 'Hospitality and Tourism Management'
    WHEN 'hospitality and tourism management' THEN 'Hospitality and Tourism Management'
    ELSE btrim(v)
  END;
$$;

CREATE OR REPLACE FUNCTION public.canonical_ft_pt(v text)
RETURNS text LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(btrim(coalesce(v,'')))
    WHEN '' THEN NULL
    WHEN 'ft' THEN 'Full-Time'
    WHEN 'full-time' THEN 'Full-Time'
    WHEN 'full time' THEN 'Full-Time'
    WHEN 'fulltime' THEN 'Full-Time'
    WHEN 'pt' THEN 'Part-Time'
    WHEN 'part-time' THEN 'Part-Time'
    WHEN 'part time' THEN 'Part-Time'
    WHEN 'parttime' THEN 'Part-Time'
    WHEN 'adjunct' THEN 'Adjunct'
    ELSE btrim(v)
  END;
$$;

-- =========================================================================
-- 2) PRE-DEDUP MERGE HELPERS
-- =========================================================================

CREATE OR REPLACE FUNCTION public._merge_aq_group(ids uuid[])
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE keeper uuid := ids[1];
        siblings uuid[] := ids[2:array_length(ids,1)]; m RECORD;
BEGIN
  IF array_length(siblings,1) IS NULL THEN RETURN; END IF;
  SELECT
    (array_agg(qualification_type ORDER BY length(coalesce(qualification_type,'')) DESC) FILTER (WHERE qualification_type IS NOT NULL))[1] AS qualification_type,
    (array_agg(degree_certification ORDER BY length(coalesce(degree_certification,'')) DESC) FILTER (WHERE degree_certification IS NOT NULL))[1] AS degree_certification,
    (array_agg(institution ORDER BY length(coalesce(institution,'')) DESC) FILTER (WHERE institution IS NOT NULL))[1] AS institution,
    (array_agg(description ORDER BY length(coalesce(description,'')) DESC) FILTER (WHERE description IS NOT NULL))[1] AS description,
    (array_agg(field_area ORDER BY length(coalesce(field_area,'')) DESC) FILTER (WHERE field_area IS NOT NULL))[1] AS field_area,
    (array_agg(year ORDER BY year DESC NULLS LAST) FILTER (WHERE year IS NOT NULL))[1] AS year
  INTO m FROM public.academic_qualifications WHERE id = ANY(ids);
  DELETE FROM public.academic_qualifications WHERE id = ANY(siblings);
  UPDATE public.academic_qualifications SET
    qualification_type = m.qualification_type, degree_certification = m.degree_certification,
    institution = m.institution, description = m.description,
    field_area = m.field_area, year = m.year
  WHERE id = keeper;
END $$;

CREATE OR REPLACE FUNCTION public._merge_eng_group(ids uuid[])
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE keeper uuid := ids[1];
        siblings uuid[] := ids[2:array_length(ids,1)]; m RECORD;
BEGIN
  IF array_length(siblings,1) IS NULL THEN RETURN; END IF;
  SELECT
    (array_agg(activity ORDER BY length(coalesce(activity,'')) DESC) FILTER (WHERE activity IS NOT NULL))[1] AS activity,
    (array_agg(from_to ORDER BY length(coalesce(from_to,'')) DESC) FILTER (WHERE from_to IS NOT NULL))[1] AS from_to,
    (array_agg(engagement_type ORDER BY length(coalesce(engagement_type,'')) DESC) FILTER (WHERE engagement_type IS NOT NULL))[1] AS engagement_type,
    (array_agg(description ORDER BY length(coalesce(description,'')) DESC) FILTER (WHERE description IS NOT NULL))[1] AS description,
    (array_agg(details ORDER BY length(coalesce(details,'')) DESC) FILTER (WHERE details IS NOT NULL))[1] AS details,
    (array_agg(year ORDER BY year DESC NULLS LAST) FILTER (WHERE year IS NOT NULL))[1] AS year
  INTO m FROM public.professional_engagements WHERE id = ANY(ids);
  DELETE FROM public.professional_engagements WHERE id = ANY(siblings);
  UPDATE public.professional_engagements SET
    activity = m.activity, from_to = m.from_to, engagement_type = m.engagement_type,
    description = m.description, details = m.details, year = m.year
  WHERE id = keeper;
END $$;

CREATE OR REPLACE FUNCTION public._merge_svc_group(ids uuid[])
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE keeper uuid := ids[1];
        siblings uuid[] := ids[2:array_length(ids,1)]; m RECORD;
BEGIN
  IF array_length(siblings,1) IS NULL THEN RETURN; END IF;
  SELECT
    (array_agg(contribution_type ORDER BY length(coalesce(contribution_type,'')) DESC) FILTER (WHERE contribution_type IS NOT NULL))[1] AS contribution_type,
    (array_agg(committee_role ORDER BY length(coalesce(committee_role,'')) DESC) FILTER (WHERE committee_role IS NOT NULL))[1] AS committee_role,
    (array_agg(level ORDER BY length(coalesce(level,'')) DESC) FILTER (WHERE level IS NOT NULL))[1] AS level,
    (array_agg(from_to ORDER BY length(coalesce(from_to,'')) DESC) FILTER (WHERE from_to IS NOT NULL))[1] AS from_to,
    (array_agg(description ORDER BY length(coalesce(description,'')) DESC) FILTER (WHERE description IS NOT NULL))[1] AS description,
    (array_agg(year ORDER BY year DESC NULLS LAST) FILTER (WHERE year IS NOT NULL))[1] AS year
  INTO m FROM public.service_contributions WHERE id = ANY(ids);
  DELETE FROM public.service_contributions WHERE id = ANY(siblings);
  UPDATE public.service_contributions SET
    contribution_type = m.contribution_type, committee_role = m.committee_role,
    level = m.level, from_to = m.from_to, description = m.description, year = m.year
  WHERE id = keeper;
END $$;

CREATE OR REPLACE FUNCTION public._merge_exp_group(ids uuid[])
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE keeper uuid := ids[1];
        siblings uuid[] := ids[2:array_length(ids,1)]; m RECORD;
BEGIN
  IF array_length(siblings,1) IS NULL THEN RETURN; END IF;
  SELECT
    (array_agg(position_title ORDER BY length(coalesce(position_title,'')) DESC) FILTER (WHERE position_title IS NOT NULL))[1] AS position_title,
    (array_agg(organization ORDER BY length(coalesce(organization,'')) DESC) FILTER (WHERE organization IS NOT NULL))[1] AS organization,
    (array_agg(period ORDER BY length(coalesce(period,'')) DESC) FILTER (WHERE period IS NOT NULL))[1] AS period,
    (array_agg(key_responsibilities ORDER BY length(coalesce(key_responsibilities,'')) DESC) FILTER (WHERE key_responsibilities IS NOT NULL))[1] AS key_responsibilities
  INTO m FROM public.professional_experience WHERE id = ANY(ids);
  DELETE FROM public.professional_experience WHERE id = ANY(siblings);
  UPDATE public.professional_experience SET
    position_title = m.position_title, organization = m.organization,
    period = m.period, key_responsibilities = m.key_responsibilities
  WHERE id = keeper;
END $$;

-- 2) Run dedup loops -----------------------------------------------------
DO $$
DECLARE grp RECORD;
BEGIN
  FOR grp IN
    SELECT faculty_id, public.norm_text(degree_certification) d, public.norm_text(institution) i, COALESCE(year,-1) y, array_agg(id ORDER BY created_at) ids
    FROM public.academic_qualifications WHERE degree_certification IS NOT NULL
    GROUP BY faculty_id, public.norm_text(degree_certification), public.norm_text(institution), COALESCE(year,-1)
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.audit_log(action,target_table,target_record,details)
    VALUES('pre_migration_merge_aq','academic_qualifications', grp.ids[1]::text,
           jsonb_build_object('faculty_id',grp.faculty_id,'degree',grp.d,'institution',grp.i,'year',grp.y,
                              'merged_ids', to_jsonb(grp.ids[2:array_length(grp.ids,1)])));
    PERFORM public._merge_aq_group(grp.ids);
  END LOOP;

  FOR grp IN
    SELECT faculty_id, public.norm_text(activity) a, public.norm_text(from_to) p, array_agg(id ORDER BY created_at) ids
    FROM public.professional_engagements WHERE activity IS NOT NULL
    GROUP BY faculty_id, public.norm_text(activity), public.norm_text(from_to)
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.audit_log(action,target_table,target_record,details)
    VALUES('pre_migration_merge_eng','professional_engagements', grp.ids[1]::text,
           jsonb_build_object('faculty_id',grp.faculty_id,'activity',grp.a,'period',grp.p,
                              'merged_ids', to_jsonb(grp.ids[2:array_length(grp.ids,1)])));
    PERFORM public._merge_eng_group(grp.ids);
  END LOOP;

  FOR grp IN
    SELECT faculty_id, public.norm_text(committee_role) r, public.norm_text(from_to) p, public.norm_text(level) l, array_agg(id ORDER BY created_at) ids
    FROM public.service_contributions WHERE committee_role IS NOT NULL
    GROUP BY faculty_id, public.norm_text(committee_role), public.norm_text(from_to), public.norm_text(level)
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.audit_log(action,target_table,target_record,details)
    VALUES('pre_migration_merge_svc','service_contributions', grp.ids[1]::text,
           jsonb_build_object('faculty_id',grp.faculty_id,'role',grp.r,'period',grp.p,'level',grp.l,
                              'merged_ids', to_jsonb(grp.ids[2:array_length(grp.ids,1)])));
    PERFORM public._merge_svc_group(grp.ids);
  END LOOP;

  FOR grp IN
    SELECT faculty_id, public.norm_text(position_title) t, public.norm_text(organization) o, public.norm_text(period) p, array_agg(id ORDER BY created_at) ids
    FROM public.professional_experience WHERE position_title IS NOT NULL
    GROUP BY faculty_id, public.norm_text(position_title), public.norm_text(organization), public.norm_text(period)
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.audit_log(action,target_table,target_record,details)
    VALUES('pre_migration_merge_exp','professional_experience', grp.ids[1]::text,
           jsonb_build_object('faculty_id',grp.faculty_id,'title',grp.t,'org',grp.o,'period',grp.p,
                              'merged_ids', to_jsonb(grp.ids[2:array_length(grp.ids,1)])));
    PERFORM public._merge_exp_group(grp.ids);
  END LOOP;
END $$;

-- =========================================================================
-- 3) NORMALIZATION + VALIDATION TRIGGERS
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_normalize_faculty_profile()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.department := public.canonical_department(NEW.department);
  NEW.ft_pt_status := public.canonical_ft_pt(NEW.ft_pt_status);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_faculty_profile ON public.faculty_profiles;
CREATE TRIGGER trg_normalize_faculty_profile
BEFORE INSERT OR UPDATE ON public.faculty_profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_faculty_profile();

CREATE OR REPLACE FUNCTION public.tg_normalize_app_user()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.department := public.canonical_department(NEW.department);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_app_user ON public.app_users;
CREATE TRIGGER trg_normalize_app_user
BEFORE INSERT OR UPDATE ON public.app_users
FOR EACH ROW EXECUTE FUNCTION public.tg_normalize_app_user();

UPDATE public.faculty_profiles
SET department = public.canonical_department(department),
    ft_pt_status = public.canonical_ft_pt(ft_pt_status);
UPDATE public.app_users
SET department = public.canonical_department(department);

CREATE OR REPLACE FUNCTION public.tg_validate_aq()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.qualification_type := public.clean_cv(NEW.qualification_type);
  NEW.degree_certification := public.clean_cv(NEW.degree_certification);
  NEW.institution := public.clean_cv(NEW.institution);
  NEW.field_area := public.clean_cv(NEW.field_area);
  NEW.description := public.clean_cv(NEW.description);
  IF NEW.field_area IS NOT NULL AND NEW.field_area ~ '^(19|20)\d{2}$' THEN
    IF NEW.year IS NULL THEN NEW.year := NEW.field_area::int; END IF;
    NEW.field_area := NULL;
  END IF;
  IF NEW.year IS NULL AND NEW.description IS NOT NULL THEN
    NEW.year := NULLIF(substring(NEW.description from '(19|20)\d{2}'),'')::int;
  END IF;
  IF NEW.degree_certification IS NULL AND NEW.institution IS NULL THEN
    RAISE EXCEPTION 'academic_qualifications: needs at least degree_certification or institution';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_aq ON public.academic_qualifications;
CREATE TRIGGER trg_validate_aq
BEFORE INSERT OR UPDATE ON public.academic_qualifications
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_aq();

CREATE OR REPLACE FUNCTION public.tg_validate_eng()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE swap_tmp text;
BEGIN
  NEW.activity := public.clean_cv(NEW.activity);
  NEW.from_to := public.clean_cv(NEW.from_to);
  NEW.engagement_type := public.clean_cv(NEW.engagement_type);
  NEW.description := public.clean_cv(NEW.description);
  NEW.details := public.clean_cv(NEW.details);
  IF NEW.activity IS NOT NULL
     AND NEW.activity ~ '^[0-9]{4}([-–][0-9]{4}|[-–][Pp]resent)?$'
     AND NEW.from_to IS NOT NULL
     AND NEW.from_to !~ '^[0-9]{4}' THEN
    swap_tmp := NEW.activity; NEW.activity := NEW.from_to; NEW.from_to := swap_tmp;
  END IF;
  IF NEW.year IS NULL AND NEW.from_to IS NOT NULL THEN
    NEW.year := NULLIF(substring(NEW.from_to from '(19|20)\d{2}'),'')::int;
  END IF;
  IF NEW.activity IS NULL THEN
    RAISE EXCEPTION 'professional_engagements: activity is required';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_eng ON public.professional_engagements;
CREATE TRIGGER trg_validate_eng
BEFORE INSERT OR UPDATE ON public.professional_engagements
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_eng();

CREATE OR REPLACE FUNCTION public.tg_validate_svc()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.contribution_type := public.clean_cv(NEW.contribution_type);
  NEW.committee_role := public.clean_cv(NEW.committee_role);
  NEW.level := public.clean_cv(NEW.level);
  NEW.from_to := public.clean_cv(NEW.from_to);
  NEW.description := public.clean_cv(NEW.description);
  IF NEW.year IS NULL AND NEW.from_to IS NOT NULL THEN
    NEW.year := NULLIF(substring(NEW.from_to from '(19|20)\d{2}'),'')::int;
  END IF;
  IF NEW.committee_role IS NULL THEN
    RAISE EXCEPTION 'service_contributions: committee_role is required';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_svc ON public.service_contributions;
CREATE TRIGGER trg_validate_svc
BEFORE INSERT OR UPDATE ON public.service_contributions
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_svc();

CREATE OR REPLACE FUNCTION public.tg_validate_exp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.position_title := public.clean_cv(NEW.position_title);
  NEW.organization := public.clean_cv(NEW.organization);
  NEW.period := public.clean_cv(NEW.period);
  NEW.key_responsibilities := public.clean_cv(NEW.key_responsibilities);
  IF NEW.position_title IS NULL AND NEW.organization IS NULL THEN
    RAISE EXCEPTION 'professional_experience: needs position_title or organization';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_exp ON public.professional_experience;
CREATE TRIGGER trg_validate_exp
BEFORE INSERT OR UPDATE ON public.professional_experience
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_exp();

-- =========================================================================
-- 4) UNIQUE INDEXES
-- =========================================================================
CREATE UNIQUE INDEX IF NOT EXISTS academic_qualifications_unique_key
ON public.academic_qualifications
(faculty_id, public.norm_text(degree_certification), public.norm_text(institution), COALESCE(year,-1))
WHERE degree_certification IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS professional_engagements_unique_key
ON public.professional_engagements
(faculty_id, public.norm_text(activity), public.norm_text(from_to))
WHERE activity IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS service_contributions_unique_key
ON public.service_contributions
(faculty_id, public.norm_text(committee_role), public.norm_text(from_to), public.norm_text(level))
WHERE committee_role IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS professional_experience_unique_key
ON public.professional_experience
(faculty_id, public.norm_text(position_title), public.norm_text(organization), public.norm_text(period))
WHERE position_title IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS awards_recognition_unique_key
ON public.awards_recognition
(faculty_id, public.norm_text(coalesce(award_name,award)), COALESCE(year,-1))
WHERE coalesce(award_name,award) IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS intellectual_contributions_title_year_unique
ON public.intellectual_contributions
(faculty_id, public.norm_text(title), COALESCE(year,-1))
WHERE title IS NOT NULL AND length(public.norm_text(title)) >= 8;

-- =========================================================================
-- 5) PROOF WORKFLOW COLUMNS
-- =========================================================================
ALTER TABLE public.professional_engagements
  ADD COLUMN IF NOT EXISTS proof_status text DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS proof_file_path text,
  ADD COLUMN IF NOT EXISTS proof_review_comment text,
  ADD COLUMN IF NOT EXISTS proof_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS proof_reviewed_at timestamptz;

ALTER TABLE public.professional_experience
  ADD COLUMN IF NOT EXISTS proof_status text DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS proof_file_path text,
  ADD COLUMN IF NOT EXISTS proof_review_comment text,
  ADD COLUMN IF NOT EXISTS proof_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS proof_reviewed_at timestamptz;

ALTER TABLE public.service_contributions
  ADD COLUMN IF NOT EXISTS proof_status text DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS proof_file_path text,
  ADD COLUMN IF NOT EXISTS proof_review_comment text,
  ADD COLUMN IF NOT EXISTS proof_reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS proof_reviewed_at timestamptz;

ALTER TABLE public.professional_engagements
  DROP CONSTRAINT IF EXISTS professional_engagements_proof_status_chk,
  ADD  CONSTRAINT professional_engagements_proof_status_chk
       CHECK (proof_status IN ('missing','uploaded','under_review','verified','rejected'));
ALTER TABLE public.professional_experience
  DROP CONSTRAINT IF EXISTS professional_experience_proof_status_chk,
  ADD  CONSTRAINT professional_experience_proof_status_chk
       CHECK (proof_status IN ('missing','uploaded','under_review','verified','rejected'));
ALTER TABLE public.service_contributions
  DROP CONSTRAINT IF EXISTS service_contributions_proof_status_chk,
  ADD  CONSTRAINT service_contributions_proof_status_chk
       CHECK (proof_status IN ('missing','uploaded','under_review','verified','rejected'));

DROP FUNCTION IF EXISTS public._merge_aq_group(uuid[]);
DROP FUNCTION IF EXISTS public._merge_eng_group(uuid[]);
DROP FUNCTION IF EXISTS public._merge_svc_group(uuid[]);
DROP FUNCTION IF EXISTS public._merge_exp_group(uuid[]);
