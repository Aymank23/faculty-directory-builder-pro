-- The previous rule treated (faculty, activity, from_to) as unique. Under the
-- established data convention `activity` holds the AACSB activity TYPE label, so
-- two genuinely different engagements of the same type in the same period
-- collided. Include the details text in the key.
DROP INDEX IF EXISTS public.professional_engagements_unique_key;

CREATE UNIQUE INDEX professional_engagements_unique_key
  ON public.professional_engagements
  USING btree (
    faculty_id,
    norm_text(activity),
    COALESCE(norm_text(from_to), ''),
    COALESCE(norm_text(details), '')
  )
  WHERE (activity IS NOT NULL);