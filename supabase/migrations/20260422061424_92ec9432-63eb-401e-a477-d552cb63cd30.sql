-- Step A: engagements where from_to is noise AND activity holds a period AND details holds the real activity.
-- Promote: details -> activity, activity -> from_to.
UPDATE public.professional_engagements
SET
  from_to = activity,
  activity = details,
  details = NULL
WHERE from_to ILIKE '%listed from most recent%'
  AND activity ~ '^[0-9]{4}'
  AND details IS NOT NULL
  AND TRIM(details) <> '';

-- Step B: any leftover noise text in from_to -> clear it.
UPDATE public.professional_engagements
SET from_to = NULL
WHERE from_to ILIKE '%listed from most recent%'
   OR from_to ILIKE '%most recent to last%';

-- Step C: noise text in activity -> clear it.
UPDATE public.professional_engagements
SET activity = NULL
WHERE activity ILIKE '%listed from most recent%'
   OR activity ILIKE '%most recent to last%';

-- Step D: noise text in details -> clear it.
UPDATE public.professional_engagements
SET details = NULL
WHERE details ILIKE '%listed from most recent%'
   OR details ILIKE '%most recent to last%';

-- Step E: backfill year from from_to / activity when numeric.
UPDATE public.professional_engagements
SET year = CAST(SUBSTRING(from_to FROM '(19|20)[0-9]{2}') AS INTEGER)
WHERE year IS NULL
  AND from_to ~ '(19|20)[0-9]{2}';

-- Step F: drop fully empty engagement rows produced by cleanup.
DELETE FROM public.professional_engagements
WHERE COALESCE(TRIM(activity), '') = ''
  AND COALESCE(TRIM(from_to), '') = ''
  AND COALESCE(TRIM(details), '') = ''
  AND COALESCE(TRIM(description), '') = '';

-- Step G: awards / qualifications - clear any noise text that may have leaked in.
UPDATE public.awards_recognition
SET award = NULL
WHERE award ILIKE '%listed from most recent%';

UPDATE public.awards_recognition
SET award_name = NULL
WHERE award_name ILIKE '%listed from most recent%';

UPDATE public.awards_recognition
SET institution_organization = NULL
WHERE institution_organization ILIKE '%listed from most recent%';

DELETE FROM public.awards_recognition
WHERE COALESCE(TRIM(award), '') = ''
  AND COALESCE(TRIM(award_name), '') = ''
  AND COALESCE(TRIM(institution_organization), '') = ''
  AND year IS NULL;

UPDATE public.academic_qualifications
SET degree_certification = NULL
WHERE degree_certification ILIKE '%listed from most recent%';

UPDATE public.academic_qualifications
SET field_area = NULL
WHERE field_area ILIKE '%listed from most recent%';

UPDATE public.academic_qualifications
SET institution = NULL
WHERE institution ILIKE '%listed from most recent%';