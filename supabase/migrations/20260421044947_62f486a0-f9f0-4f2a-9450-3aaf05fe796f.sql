
DO $$
DECLARE
  dup RECORD;
  keeper_id UUID;
  loser_ids UUID[];
BEGIN
  FOR dup IN
    SELECT employee_id, array_agg(faculty_id ORDER BY updated_at DESC NULLS LAST, created_at DESC) AS ids
    FROM faculty_profiles
    WHERE employee_id IS NOT NULL AND TRIM(employee_id) <> ''
    GROUP BY employee_id
    HAVING COUNT(*) > 1
  LOOP
    keeper_id := dup.ids[1];
    loser_ids := dup.ids[2:array_length(dup.ids, 1)];
    UPDATE academic_qualifications      SET faculty_id = keeper_id WHERE faculty_id = ANY(loser_ids);
    -- Skip ICs whose DOI would now collide with keeper's existing DOI; delete those losers
    DELETE FROM intellectual_contributions a
     WHERE a.faculty_id = ANY(loser_ids)
       AND a.doi IS NOT NULL AND TRIM(a.doi) <> ''
       AND EXISTS (
         SELECT 1 FROM intellectual_contributions b
          WHERE b.faculty_id = keeper_id AND lower(b.doi) = lower(a.doi)
       );
    UPDATE intellectual_contributions   SET faculty_id = keeper_id WHERE faculty_id = ANY(loser_ids);
    UPDATE professional_engagements     SET faculty_id = keeper_id WHERE faculty_id = ANY(loser_ids);
    UPDATE service_contributions        SET faculty_id = keeper_id WHERE faculty_id = ANY(loser_ids);
    UPDATE awards_recognition           SET faculty_id = keeper_id WHERE faculty_id = ANY(loser_ids);
    UPDATE teaching_load                SET faculty_id = keeper_id WHERE faculty_id = ANY(loser_ids);
    UPDATE professional_experience      SET faculty_id = keeper_id WHERE faculty_id = ANY(loser_ids);
    UPDATE cv_uploads                   SET faculty_id = keeper_id WHERE faculty_id = ANY(loser_ids);
    UPDATE faculty_profiles k
       SET user_id = COALESCE(k.user_id, (SELECT user_id FROM faculty_profiles WHERE faculty_id = ANY(loser_ids) AND user_id IS NOT NULL LIMIT 1))
     WHERE k.faculty_id = keeper_id;
    DELETE FROM faculty_profiles WHERE faculty_id = ANY(loser_ids);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS faculty_profiles_employee_id_unique
  ON public.faculty_profiles (employee_id)
  WHERE employee_id IS NOT NULL AND TRIM(employee_id) <> '';

INSERT INTO professional_engagements (faculty_id, activity, details, year, engagement_type, from_to)
SELECT
  faculty_id,
  COALESCE(NULLIF(title, ''), ic_type, 'Academic engagement') AS activity,
  apa_citation AS details,
  year,
  ic_type AS engagement_type,
  CASE WHEN year IS NOT NULL THEN year::text END AS from_to
FROM intellectual_contributions
WHERE ic_type IN ('Academic Conference Proceeding','Academic Conference Paper Presentation','Designing/Delivering Online Courses','Editorial Position','Other IC','Others','Other','Working Paper')
   OR ic_type ~ '^[0-9]{4}$'
   OR ic_type ~ '^[A-Za-z]+\s+[0-9]{4}$';

DELETE FROM intellectual_contributions
WHERE ic_type IN ('Academic Conference Proceeding','Academic Conference Paper Presentation','Designing/Delivering Online Courses','Editorial Position','Other IC','Others','Other','Working Paper')
   OR ic_type ~ '^[0-9]{4}$'
   OR ic_type ~ '^[A-Za-z]+\s+[0-9]{4}$';
