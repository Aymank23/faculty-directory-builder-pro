-- Disable validation triggers for the duration of the cleanup so legacy
-- rows can be merged/deleted without tripping the new stricter checks.
ALTER TABLE public.academic_qualifications DISABLE TRIGGER trg_validate_aq;
ALTER TABLE public.service_contributions   DISABLE TRIGGER trg_validate_svc;

-- ============================================================
-- Step A: log + delete fully-empty rows
-- ============================================================
INSERT INTO public.audit_log (action, target_table, target_record, details)
SELECT 'cleanup_null_key_delete', 'academic_qualifications', id::text,
       jsonb_build_object('row', to_jsonb(aq))
FROM public.academic_qualifications aq
WHERE coalesce(btrim(degree_certification),'') = ''
  AND coalesce(btrim(institution),'')          = '';

INSERT INTO public.audit_log (action, target_table, target_record, details)
SELECT 'cleanup_null_key_delete', 'service_contributions', id::text,
       jsonb_build_object('row', to_jsonb(sc))
FROM public.service_contributions sc
WHERE coalesce(btrim(committee_role),'') = ''
  AND coalesce(btrim(description),'')    = ''
  AND coalesce(btrim(from_to),'')        = '';

DELETE FROM public.academic_qualifications
WHERE coalesce(btrim(degree_certification),'') = ''
  AND coalesce(btrim(institution),'')          = '';

DELETE FROM public.service_contributions
WHERE coalesce(btrim(committee_role),'') = ''
  AND coalesce(btrim(description),'')    = ''
  AND coalesce(btrim(from_to),'')        = '';

-- Also delete SVC rows that have no committee_role at all — they cannot
-- satisfy the new stricter validator and carry no useful info.
INSERT INTO public.audit_log (action, target_table, target_record, details)
SELECT 'cleanup_null_role_delete', 'service_contributions', id::text,
       jsonb_build_object('row', to_jsonb(sc))
FROM public.service_contributions sc
WHERE coalesce(btrim(committee_role),'') = '';

DELETE FROM public.service_contributions
WHERE coalesce(btrim(committee_role),'') = '';

-- ============================================================
-- Step B: merge remaining duplicates under the new (stricter) keys
-- ============================================================

-- ---- AQ merge ----
WITH groups AS (
  SELECT
    faculty_id,
    coalesce(public.norm_text(degree_certification),'') k1,
    coalesce(public.norm_text(institution),'')          k2,
    coalesce(year, 0)                                   k3,
    array_agg(id ORDER BY created_at, id)               ids
  FROM public.academic_qualifications
  GROUP BY 1,2,3,4
  HAVING COUNT(*) > 1
),
merged AS (
  SELECT
    g.ids[1] AS keeper_id,
    (SELECT degree_certification FROM public.academic_qualifications
       WHERE id = ANY(g.ids) AND coalesce(btrim(degree_certification),'') <> ''
       ORDER BY length(degree_certification) DESC NULLS LAST LIMIT 1) AS degree_certification,
    (SELECT institution FROM public.academic_qualifications
       WHERE id = ANY(g.ids) AND coalesce(btrim(institution),'') <> ''
       ORDER BY length(institution) DESC NULLS LAST LIMIT 1) AS institution,
    (SELECT field_area FROM public.academic_qualifications
       WHERE id = ANY(g.ids) AND coalesce(btrim(field_area),'') <> ''
       ORDER BY length(field_area) DESC NULLS LAST LIMIT 1) AS field_area,
    (SELECT description FROM public.academic_qualifications
       WHERE id = ANY(g.ids) AND coalesce(btrim(description),'') <> ''
       ORDER BY length(description) DESC NULLS LAST LIMIT 1) AS description,
    (SELECT qualification_type FROM public.academic_qualifications
       WHERE id = ANY(g.ids) AND coalesce(btrim(qualification_type),'') <> ''
       LIMIT 1) AS qualification_type,
    (SELECT year FROM public.academic_qualifications
       WHERE id = ANY(g.ids) AND year IS NOT NULL LIMIT 1) AS year
  FROM groups g
)
UPDATE public.academic_qualifications a
   SET degree_certification = coalesce(a.degree_certification, m.degree_certification),
       institution          = coalesce(a.institution,          m.institution),
       field_area           = coalesce(a.field_area,           m.field_area),
       description          = coalesce(a.description,          m.description),
       qualification_type   = coalesce(a.qualification_type,   m.qualification_type),
       year                 = coalesce(a.year,                 m.year)
  FROM merged m
 WHERE a.id = m.keeper_id;

INSERT INTO public.audit_log (action, target_table, target_record, details)
SELECT 'merge_dedup_delete', 'academic_qualifications', id::text,
       jsonb_build_object('row', to_jsonb(aq))
FROM public.academic_qualifications aq
WHERE id IN (
  SELECT unnest(ids[2:]) FROM (
    SELECT array_agg(id ORDER BY created_at, id) ids
    FROM public.academic_qualifications
    GROUP BY faculty_id,
             coalesce(public.norm_text(degree_certification),''),
             coalesce(public.norm_text(institution),''),
             coalesce(year, 0)
    HAVING COUNT(*) > 1
  ) s
);

DELETE FROM public.academic_qualifications
WHERE id IN (
  SELECT unnest(ids[2:]) FROM (
    SELECT array_agg(id ORDER BY created_at, id) ids
    FROM public.academic_qualifications
    GROUP BY faculty_id,
             coalesce(public.norm_text(degree_certification),''),
             coalesce(public.norm_text(institution),''),
             coalesce(year, 0)
    HAVING COUNT(*) > 1
  ) s
);

-- ---- SVC merge (uses 5-part key) ----
INSERT INTO public.audit_log (action, target_table, target_record, details)
SELECT 'merge_dedup_delete', 'service_contributions', id::text,
       jsonb_build_object('row', to_jsonb(sc))
FROM public.service_contributions sc
WHERE id IN (
  SELECT unnest(ids[2:]) FROM (
    SELECT array_agg(id ORDER BY created_at, id) ids
    FROM public.service_contributions
    GROUP BY faculty_id,
             coalesce(public.norm_text(committee_role),''),
             coalesce(public.norm_text(from_to),''),
             coalesce(public.norm_text(description),''),
             coalesce(year, 0)
    HAVING COUNT(*) > 1
  ) s
);

DELETE FROM public.service_contributions
WHERE id IN (
  SELECT unnest(ids[2:]) FROM (
    SELECT array_agg(id ORDER BY created_at, id) ids
    FROM public.service_contributions
    GROUP BY faculty_id,
             coalesce(public.norm_text(committee_role),''),
             coalesce(public.norm_text(from_to),''),
             coalesce(public.norm_text(description),''),
             coalesce(year, 0)
    HAVING COUNT(*) > 1
  ) s
);

-- ============================================================
-- Step C: harden validation triggers
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_validate_aq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.qualification_type   := public.clean_cv(NEW.qualification_type);
  NEW.degree_certification := public.clean_cv(NEW.degree_certification);
  NEW.institution          := public.clean_cv(NEW.institution);
  NEW.field_area           := public.clean_cv(NEW.field_area);
  NEW.description          := public.clean_cv(NEW.description);

  IF NEW.field_area IS NOT NULL AND NEW.field_area ~ '^(19|20)\d{2}$' THEN
    IF NEW.year IS NULL THEN NEW.year := NEW.field_area::int; END IF;
    NEW.field_area := NULL;
  END IF;
  IF NEW.year IS NULL AND NEW.description IS NOT NULL THEN
    NEW.year := NULLIF(substring(NEW.description from '(19|20)\d{2}'),'')::int;
  END IF;

  IF coalesce(btrim(NEW.degree_certification),'') = ''
     AND coalesce(btrim(NEW.institution),'') = '' THEN
    RAISE EXCEPTION 'academic_qualifications: needs at least degree_certification or institution';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_validate_svc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  NEW.contribution_type := public.clean_cv(NEW.contribution_type);
  NEW.committee_role    := public.clean_cv(NEW.committee_role);
  NEW.level             := public.clean_cv(NEW.level);
  NEW.from_to           := public.clean_cv(NEW.from_to);
  NEW.description       := public.clean_cv(NEW.description);

  IF NEW.year IS NULL AND NEW.from_to IS NOT NULL THEN
    NEW.year := NULLIF(substring(NEW.from_to from '(19|20)\d{2}'),'')::int;
  END IF;

  IF coalesce(btrim(NEW.committee_role),'') = '' THEN
    RAISE EXCEPTION 'service_contributions: committee_role is required';
  END IF;
  IF NEW.year IS NULL
     AND coalesce(btrim(NEW.from_to),'')     = ''
     AND coalesce(btrim(NEW.description),'') = '' THEN
    RAISE EXCEPTION 'service_contributions: needs year, from_to, or description in addition to committee_role';
  END IF;
  RETURN NEW;
END $function$;

-- ============================================================
-- Step D: tighten unique indexes (NULL no longer = distinct)
-- ============================================================
DROP INDEX IF EXISTS public.academic_qualifications_unique_key;
CREATE UNIQUE INDEX academic_qualifications_unique_key
ON public.academic_qualifications (
  faculty_id,
  coalesce(public.norm_text(degree_certification), ''),
  coalesce(public.norm_text(institution), ''),
  coalesce(year, 0)
);

DROP INDEX IF EXISTS public.service_contributions_unique_key;
CREATE UNIQUE INDEX service_contributions_unique_key
ON public.service_contributions (
  faculty_id,
  coalesce(public.norm_text(committee_role), ''),
  coalesce(public.norm_text(from_to), ''),
  coalesce(public.norm_text(description), ''),
  coalesce(year, 0)
);

-- Re-enable triggers
ALTER TABLE public.academic_qualifications ENABLE TRIGGER trg_validate_aq;
ALTER TABLE public.service_contributions   ENABLE TRIGGER trg_validate_svc;