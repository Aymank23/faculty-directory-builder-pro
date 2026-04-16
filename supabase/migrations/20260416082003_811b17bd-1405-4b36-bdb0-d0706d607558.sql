
-- CV uploads tracking table
CREATE TABLE public.cv_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL,
  user_id uuid,
  file_name text NOT NULL,
  upload_timestamp timestamptz NOT NULL DEFAULT now(),
  parsing_timestamp timestamptz,
  parsing_quality_score numeric,
  changes_summary jsonb,
  status text NOT NULL DEFAULT 'pending_review',
  ics_added integer DEFAULT 0,
  ics_updated integer DEFAULT 0,
  ics_skipped integer DEFAULT 0,
  profile_fields_updated integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cv_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to cv_uploads" ON public.cv_uploads FOR ALL USING (true) WITH CHECK (true);

-- Professional experience table (for practitioner CVs)
CREATE TABLE public.professional_experience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid,
  period text,
  organization text,
  position_title text,
  key_responsibilities text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_experience ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to professional_experience" ON public.professional_experience FOR ALL USING (true) WITH CHECK (true);
