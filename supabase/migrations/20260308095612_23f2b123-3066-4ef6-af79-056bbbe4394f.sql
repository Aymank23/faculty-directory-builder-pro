ALTER TABLE risk_cases
  ADD COLUMN IF NOT EXISTS term_semester text,
  ADD COLUMN IF NOT EXISTS date_of_meeting date,
  ADD COLUMN IF NOT EXISTS advisor_email text,
  ADD COLUMN IF NOT EXISTS major text,
  ADD COLUMN IF NOT EXISTS student_email text,
  ADD COLUMN IF NOT EXISTS student_phone text,
  ADD COLUMN IF NOT EXISTS cgpa numeric,
  ADD COLUMN IF NOT EXISTS credits_completed integer,
  ADD COLUMN IF NOT EXISTS financial_aid text;

ALTER TABLE outcomes
  ADD COLUMN IF NOT EXISTS other_outcome text;