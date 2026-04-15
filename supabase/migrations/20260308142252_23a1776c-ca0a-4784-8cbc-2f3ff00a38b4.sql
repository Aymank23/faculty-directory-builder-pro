
-- Drop old Student At Risk tables
DROP TABLE IF EXISTS follow_ups CASCADE;
DROP TABLE IF EXISTS intervention_forms CASCADE;
DROP TABLE IF EXISTS outcomes CASCADE;
DROP TABLE IF EXISTS risk_cases CASCADE;

-- Add campus and updated_at to app_users
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS campus text;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Faculty Profiles
CREATE TABLE faculty_profiles (
  faculty_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(user_id) ON DELETE CASCADE UNIQUE,
  first_name text,
  last_name text,
  employee_id text,
  ft_pt_status text DEFAULT 'FT',
  academic_rank text,
  highest_degree text,
  highest_degree_date date,
  department text,
  campus text,
  date_joining_aksob date,
  discipline_program text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE faculty_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to faculty_profiles" ON faculty_profiles FOR ALL USING (true) WITH CHECK (true);

-- Teaching Load
CREATE TABLE teaching_load (
  teaching_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid REFERENCES faculty_profiles(faculty_id) ON DELETE CASCADE NOT NULL,
  term text NOT NULL,
  course_code text NOT NULL,
  course_title text NOT NULL,
  section text,
  campus text,
  credits numeric DEFAULT 3,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE teaching_load ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to teaching_load" ON teaching_load FOR ALL USING (true) WITH CHECK (true);

-- Intellectual Contributions
CREATE TABLE intellectual_contributions (
  ic_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid REFERENCES faculty_profiles(faculty_id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  apa_citation text,
  authors text,
  year integer,
  journal_outlet text,
  ic_category text,
  ic_type text,
  indexing_database text,
  quartile text,
  abdc_rank text,
  doi text,
  status text NOT NULL DEFAULT 'draft',
  evidence_file_url text,
  evidence_status text DEFAULT 'not_uploaded',
  verification_date timestamptz,
  verified_by uuid REFERENCES app_users(user_id),
  rejection_reason text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE intellectual_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to intellectual_contributions" ON intellectual_contributions FOR ALL USING (true) WITH CHECK (true);

-- Add target_table column to audit_log for better tracking
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS target_table text;

-- Create storage bucket for evidence files
INSERT INTO storage.buckets (id, name, public) VALUES ('evidence', 'evidence', false) ON CONFLICT DO NOTHING;

CREATE POLICY "Authenticated users can upload evidence" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');
CREATE POLICY "Authenticated users can read evidence" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'evidence');
