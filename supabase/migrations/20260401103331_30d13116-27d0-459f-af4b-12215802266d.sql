
ALTER TABLE public.faculty_profiles
ADD COLUMN IF NOT EXISTS faculty_qualification text,
ADD COLUMN IF NOT EXISTS faculty_sufficiency text,
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS tenure_status text,
ADD COLUMN IF NOT EXISTS admin_title text,
ADD COLUMN IF NOT EXISTS degree_major text,
ADD COLUMN IF NOT EXISTS degree_institution text,
ADD COLUMN IF NOT EXISTS degree_country text,
ADD COLUMN IF NOT EXISTS middle_names text,
ADD COLUMN IF NOT EXISTS title text;
