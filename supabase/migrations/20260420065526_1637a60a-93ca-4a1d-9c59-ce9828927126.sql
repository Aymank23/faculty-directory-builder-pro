-- Step 1: Merge duplicate faculty_profiles per user_id.
-- Keep the OLDEST profile per user_id (first row created) as canonical, reassign all
-- child records to it, then delete the duplicates. Then enforce uniqueness.

DO $$
DECLARE
  rec RECORD;
  canonical_id uuid;
  dup_ids uuid[];
BEGIN
  FOR rec IN
    SELECT user_id
    FROM public.faculty_profiles
    WHERE user_id IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) > 1
  LOOP
    -- Pick canonical = oldest profile for this user
    SELECT faculty_id INTO canonical_id
    FROM public.faculty_profiles
    WHERE user_id = rec.user_id
    ORDER BY created_at ASC
    LIMIT 1;

    -- Other duplicates
    SELECT array_agg(faculty_id) INTO dup_ids
    FROM public.faculty_profiles
    WHERE user_id = rec.user_id
      AND faculty_id <> canonical_id;

    -- Reassign child records pointing to duplicate profiles
    UPDATE public.intellectual_contributions   SET faculty_id = canonical_id WHERE faculty_id = ANY(dup_ids);
    UPDATE public.academic_qualifications      SET faculty_id = canonical_id WHERE faculty_id = ANY(dup_ids);
    UPDATE public.professional_engagements     SET faculty_id = canonical_id WHERE faculty_id = ANY(dup_ids);
    UPDATE public.service_contributions        SET faculty_id = canonical_id WHERE faculty_id = ANY(dup_ids);
    UPDATE public.awards_recognition           SET faculty_id = canonical_id WHERE faculty_id = ANY(dup_ids);
    UPDATE public.professional_experience      SET faculty_id = canonical_id WHERE faculty_id = ANY(dup_ids);
    UPDATE public.teaching_load                SET faculty_id = canonical_id WHERE faculty_id = ANY(dup_ids);
    UPDATE public.cv_uploads                   SET faculty_id = canonical_id WHERE faculty_id = ANY(dup_ids);

    -- Merge non-null fields from duplicates back into canonical row (don't overwrite existing values)
    UPDATE public.faculty_profiles dst
    SET
      first_name           = COALESCE(dst.first_name,           src.first_name),
      last_name            = COALESCE(dst.last_name,            src.last_name),
      middle_names         = COALESCE(dst.middle_names,         src.middle_names),
      title                = COALESCE(dst.title,                src.title),
      department           = COALESCE(dst.department,           src.department),
      campus               = COALESCE(dst.campus,               src.campus),
      academic_rank        = COALESCE(dst.academic_rank,        src.academic_rank),
      admin_title          = COALESCE(dst.admin_title,          src.admin_title),
      ft_pt_status         = COALESCE(dst.ft_pt_status,         src.ft_pt_status),
      email                = COALESCE(dst.email,                src.email),
      faculty_qualification= COALESCE(dst.faculty_qualification,src.faculty_qualification),
      faculty_sufficiency  = COALESCE(dst.faculty_sufficiency,  src.faculty_sufficiency),
      tenure_status        = COALESCE(dst.tenure_status,        src.tenure_status),
      highest_degree       = COALESCE(dst.highest_degree,       src.highest_degree),
      highest_degree_date  = COALESCE(dst.highest_degree_date,  src.highest_degree_date),
      degree_major         = COALESCE(dst.degree_major,         src.degree_major),
      degree_institution   = COALESCE(dst.degree_institution,   src.degree_institution),
      degree_country       = COALESCE(dst.degree_country,       src.degree_country),
      date_joining_aksob   = COALESCE(dst.date_joining_aksob,   src.date_joining_aksob),
      employee_id          = COALESCE(dst.employee_id,          src.employee_id),
      discipline_program   = COALESCE(dst.discipline_program,   src.discipline_program),
      updated_at           = now()
    FROM (
      SELECT * FROM public.faculty_profiles
      WHERE faculty_id = ANY(dup_ids)
      ORDER BY updated_at DESC
      LIMIT 1
    ) src
    WHERE dst.faculty_id = canonical_id;

    -- Delete the duplicate profiles
    DELETE FROM public.faculty_profiles WHERE faculty_id = ANY(dup_ids);
  END LOOP;
END $$;

-- Step 2: Prevent future duplicates with a partial unique index on user_id (only when not null).
CREATE UNIQUE INDEX IF NOT EXISTS faculty_profiles_user_id_unique
  ON public.faculty_profiles (user_id)
  WHERE user_id IS NOT NULL;

-- Step 3: Helpful supporting indexes for dashboard performance.
CREATE INDEX IF NOT EXISTS intellectual_contributions_faculty_id_idx
  ON public.intellectual_contributions (faculty_id);

CREATE INDEX IF NOT EXISTS intellectual_contributions_faculty_year_idx
  ON public.intellectual_contributions (faculty_id, year DESC);
