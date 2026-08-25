-- Requirement 5/6/8/9/10: classification, reporting type, record class, verification, dedup
ALTER TABLE public.intellectual_contributions
  ADD COLUMN IF NOT EXISTS original_cv_item_type text,
  ADD COLUMN IF NOT EXISTS ic_reporting_type text DEFAULT 'Needs Review',
  ADD COLUMN IF NOT EXISTS record_class text NOT NULL DEFAULT 'ic',
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'under_review',
  ADD COLUMN IF NOT EXISTS canonical_key text,
  ADD COLUMN IF NOT EXISTS admin_notes text,
  ADD COLUMN IF NOT EXISTS reclassified_by uuid,
  ADD COLUMN IF NOT EXISTS reclassified_at timestamptz;

-- Backfill verification_status from the legacy status column (3 statuses only)
UPDATE public.intellectual_contributions
SET verification_status = CASE
  WHEN status = 'verified' THEN 'verified'
  WHEN status = 'rejected' THEN 'excluded'
  ELSE 'under_review'
END
WHERE verification_status IS NULL OR verification_status NOT IN ('verified','under_review','excluded');

-- Preserve original CV classification where we only have ic_type today
UPDATE public.intellectual_contributions
SET original_cv_item_type = ic_type
WHERE original_cv_item_type IS NULL AND ic_type IS NOT NULL;

ALTER TABLE public.intellectual_contributions
  DROP CONSTRAINT IF EXISTS ic_record_class_check,
  DROP CONSTRAINT IF EXISTS ic_verification_status_check;
ALTER TABLE public.intellectual_contributions
  ADD CONSTRAINT ic_record_class_check CHECK (record_class IN ('ic','academic_engagement')),
  ADD CONSTRAINT ic_verification_status_check CHECK (verification_status IN ('verified','under_review','excluded'));

CREATE INDEX IF NOT EXISTS ic_canonical_key_idx ON public.intellectual_contributions (canonical_key);
CREATE INDEX IF NOT EXISTS ic_record_class_idx ON public.intellectual_contributions (record_class);

-- Prevent repeated CV processing from creating duplicates per faculty
CREATE UNIQUE INDEX IF NOT EXISTS ic_faculty_canonical_unique
  ON public.intellectual_contributions (faculty_id, canonical_key)
  WHERE canonical_key IS NOT NULL;

-- Requirement 5: preserve the source classification on activity tables too
ALTER TABLE public.professional_engagements ADD COLUMN IF NOT EXISTS original_cv_item_type text;
ALTER TABLE public.service_contributions ADD COLUMN IF NOT EXISTS original_cv_item_type text;
ALTER TABLE public.awards_recognition ADD COLUMN IF NOT EXISTS original_cv_item_type text;
ALTER TABLE public.professional_experience ADD COLUMN IF NOT EXISTS original_cv_item_type text;

UPDATE public.professional_engagements SET original_cv_item_type = activity WHERE original_cv_item_type IS NULL AND activity IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intellectual_contributions TO authenticated, anon;
GRANT ALL ON public.intellectual_contributions TO service_role;