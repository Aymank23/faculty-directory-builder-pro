-- Step A: rows where header text ended up in from_to AND values are shifted right
-- Pattern: from_to = header, level = "2022-2023", committee_role = "School"
-- Move level -> from_to, committee_role -> level, and clear committee_role.
UPDATE public.service_contributions
SET
  from_to = level,
  level = committee_role,
  committee_role = NULL
WHERE from_to ILIKE '%listed from most recent%'
  AND committee_role IN ('Department','School','College','University','National','International','Community','Professional','Industry');

-- Step B: rows where header text is the only thing in committee_role.
-- It's a section header, not a real role -> clear it.
UPDATE public.service_contributions
SET committee_role = NULL
WHERE committee_role ILIKE '%listed from most recent%';

-- Step C: any leftover header text still sitting in from_to -> clear it.
UPDATE public.service_contributions
SET from_to = NULL
WHERE from_to ILIKE '%listed from most recent%';

-- Step D: drop fully empty rows produced by Step B (no role, no period, only level word).
DELETE FROM public.service_contributions
WHERE COALESCE(TRIM(committee_role), '') = ''
  AND COALESCE(TRIM(from_to), '') = ''
  AND COALESCE(TRIM(description), '') = '';