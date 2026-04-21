
-- Dedupe intellectual_contributions by (faculty_id, lower(doi)) keeping newest
DELETE FROM intellectual_contributions a
USING intellectual_contributions b
WHERE a.faculty_id = b.faculty_id
  AND lower(a.doi) = lower(b.doi)
  AND a.doi IS NOT NULL AND b.doi IS NOT NULL
  AND TRIM(a.doi) <> '' AND TRIM(b.doi) <> ''
  AND (a.updated_at, a.ic_id::text) < (b.updated_at, b.ic_id::text);

CREATE UNIQUE INDEX IF NOT EXISTS intellectual_contributions_faculty_doi_unique
  ON public.intellectual_contributions (faculty_id, lower(doi))
  WHERE doi IS NOT NULL AND TRIM(doi) <> '';
