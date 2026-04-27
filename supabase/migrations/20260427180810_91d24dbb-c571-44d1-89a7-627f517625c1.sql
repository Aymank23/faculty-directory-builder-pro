-- =========================================================================
-- Pre-migration: dedup & merge intellectual_contributions
-- Pattern: capture merged values into a temp record, DELETE siblings,
-- THEN UPDATE the keeper. Avoids tripping the existing partial unique
-- index on (faculty_id, lower(doi)).
-- =========================================================================

-- 1) Helper functions ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.norm_text(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(lower(regexp_replace(coalesce(v,''), '\s+', ' ', 'g')), '');
$$;

CREATE OR REPLACE FUNCTION public.norm_doi(v text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(
    regexp_replace(
      regexp_replace(lower(trim(coalesce(v,''))), '^(https?://)?(dx\.)?doi\.org/', ''),
      '[\s\.\,\)\(\]\[;:]+$', ''
    ),
    ''
  );
$$;

-- 2) Delete pure-noise rows ----------------------------------------------
WITH noise AS (
  SELECT ic_id FROM public.intellectual_contributions
  WHERE coalesce(trim(title),'') ~ '^(19|20)\d{2}$'
    AND (authors IS NULL OR trim(authors) = '')
    AND (doi IS NULL OR trim(doi) = '')
    AND (journal_outlet IS NULL OR trim(journal_outlet) = '')
    AND (coalesce(trim(apa_citation),'') ~ '^(19|20)\d{2}$'
         OR coalesce(trim(apa_citation),'') = '')
)
INSERT INTO public.audit_log (action, target_table, target_record, details)
SELECT 'pre_migration_delete_noise_ic', 'intellectual_contributions', ic_id::text,
       jsonb_build_object('reason', 'title_is_year_only_no_metadata')
FROM noise;

DELETE FROM public.intellectual_contributions
WHERE coalesce(trim(title),'') ~ '^(19|20)\d{2}$'
  AND (authors IS NULL OR trim(authors) = '')
  AND (doi IS NULL OR trim(doi) = '')
  AND (journal_outlet IS NULL OR trim(journal_outlet) = '')
  AND (coalesce(trim(apa_citation),'') ~ '^(19|20)\d{2}$'
       OR coalesce(trim(apa_citation),'') = '');

-- 3) Generic merge helper: takes a list of ic_ids, the first is keeper.
--    Captures merged values, deletes siblings, then updates keeper.
CREATE OR REPLACE FUNCTION public._merge_ic_group(ids uuid[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  keeper uuid := ids[1];
  siblings uuid[] := ids[2:array_length(ids,1)];
  m RECORD;
BEGIN
  IF array_length(siblings,1) IS NULL THEN RETURN; END IF;

  SELECT
    (array_agg(title             ORDER BY length(coalesce(title,'')) DESC) FILTER (WHERE title IS NOT NULL))[1] AS title,
    (array_agg(authors           ORDER BY length(coalesce(authors,'')) DESC) FILTER (WHERE authors IS NOT NULL))[1] AS authors,
    (array_agg(apa_citation      ORDER BY length(coalesce(apa_citation,'')) DESC) FILTER (WHERE apa_citation IS NOT NULL))[1] AS apa_citation,
    (array_agg(journal_outlet    ORDER BY length(coalesce(journal_outlet,'')) DESC) FILTER (WHERE journal_outlet IS NOT NULL AND journal_outlet !~ '^[\(\)\[\];:\s]*$' AND lower(journal_outlet) NOT LIKE 'doi:%'))[1] AS journal_outlet,
    (array_agg(ic_type           ORDER BY length(coalesce(ic_type,'')) DESC) FILTER (WHERE ic_type IS NOT NULL))[1] AS ic_type,
    (array_agg(ic_category       ORDER BY length(coalesce(ic_category,'')) DESC) FILTER (WHERE ic_category IS NOT NULL))[1] AS ic_category,
    (array_agg(indexing_database ORDER BY length(coalesce(indexing_database,'')) DESC) FILTER (WHERE indexing_database IS NOT NULL))[1] AS indexing_database,
    (array_agg(quartile          ORDER BY length(coalesce(quartile,'')) DESC) FILTER (WHERE quartile IS NOT NULL))[1] AS quartile,
    (array_agg(abdc_rank         ORDER BY length(coalesce(abdc_rank,'')) DESC) FILTER (WHERE abdc_rank IS NOT NULL))[1] AS abdc_rank,
    (array_agg(impact_factor     ORDER BY length(coalesce(impact_factor,'')) DESC) FILTER (WHERE impact_factor IS NOT NULL))[1] AS impact_factor,
    (array_agg(year              ORDER BY year DESC NULLS LAST) FILTER (WHERE year IS NOT NULL))[1] AS year,
    -- Pick the cleanest DOI: bare form preferred, then shortest non-empty normalized
    (array_agg(public.norm_doi(doi) ORDER BY length(coalesce(public.norm_doi(doi),''))) FILTER (WHERE public.norm_doi(doi) IS NOT NULL))[1] AS doi,
    (array_agg(evidence_file_url ORDER BY length(coalesce(evidence_file_url,'')) DESC) FILTER (WHERE evidence_file_url IS NOT NULL))[1] AS evidence_file_url,
    (array_agg(evidence_status   ORDER BY CASE evidence_status WHEN 'verified' THEN 1 WHEN 'uploaded' THEN 2 WHEN 'under_review' THEN 3 ELSE 4 END) FILTER (WHERE evidence_status IS NOT NULL))[1] AS evidence_status,
    (array_agg(status            ORDER BY CASE status WHEN 'verified' THEN 1 WHEN 'approved' THEN 2 WHEN 'under_review' THEN 3 ELSE 4 END) FILTER (WHERE status IS NOT NULL))[1] AS status
  INTO m
  FROM public.intellectual_contributions
  WHERE ic_id = ANY(ids);

  -- Delete siblings FIRST so unique index is freed
  DELETE FROM public.intellectual_contributions WHERE ic_id = ANY(siblings);

  -- Now update keeper with merged values
  UPDATE public.intellectual_contributions SET
    title             = m.title,
    authors           = m.authors,
    apa_citation      = m.apa_citation,
    journal_outlet    = m.journal_outlet,
    ic_type           = m.ic_type,
    ic_category       = m.ic_category,
    indexing_database = m.indexing_database,
    quartile          = m.quartile,
    abdc_rank         = m.abdc_rank,
    impact_factor     = m.impact_factor,
    year              = m.year,
    doi               = m.doi,
    evidence_file_url = m.evidence_file_url,
    evidence_status   = m.evidence_status,
    status            = m.status
  WHERE ic_id = keeper;
END $$;

-- 4) Merge by (faculty_id, norm_title, year) -----------------------------
DO $$
DECLARE grp RECORD;
BEGIN
  FOR grp IN
    SELECT faculty_id, public.norm_text(title) AS k, year,
           array_agg(ic_id ORDER BY created_at) AS ids
    FROM public.intellectual_contributions
    WHERE title IS NOT NULL AND public.norm_text(title) IS NOT NULL
      AND length(public.norm_text(title)) >= 8
    GROUP BY faculty_id, public.norm_text(title), year
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.audit_log (action, target_table, target_record, details)
    VALUES ('pre_migration_merge_ic_title_year', 'intellectual_contributions', grp.ids[1]::text,
            jsonb_build_object('faculty_id', grp.faculty_id, 'title_norm', grp.k,
                               'year', grp.year,
                               'merged_ids', to_jsonb(grp.ids[2:array_length(grp.ids,1)])));
    PERFORM public._merge_ic_group(grp.ids);
  END LOOP;
END $$;

-- 5) Merge by (faculty_id, norm_doi) -------------------------------------
DO $$
DECLARE grp RECORD;
BEGIN
  FOR grp IN
    SELECT faculty_id, public.norm_doi(doi) AS k,
           array_agg(ic_id ORDER BY created_at) AS ids
    FROM public.intellectual_contributions
    WHERE doi IS NOT NULL AND public.norm_doi(doi) IS NOT NULL
    GROUP BY faculty_id, public.norm_doi(doi)
    HAVING COUNT(*) > 1
  LOOP
    INSERT INTO public.audit_log (action, target_table, target_record, details)
    VALUES ('pre_migration_merge_ic_doi', 'intellectual_contributions', grp.ids[1]::text,
            jsonb_build_object('faculty_id', grp.faculty_id, 'doi_norm', grp.k,
                               'merged_ids', to_jsonb(grp.ids[2:array_length(grp.ids,1)])));
    PERFORM public._merge_ic_group(grp.ids);
  END LOOP;
END $$;

-- 6) Final DOI normalization in place ------------------------------------
UPDATE public.intellectual_contributions
SET doi = public.norm_doi(doi)
WHERE doi IS NOT NULL
  AND doi IS DISTINCT FROM public.norm_doi(doi);

-- 7) Drop helper (no longer needed) --------------------------------------
DROP FUNCTION IF EXISTS public._merge_ic_group(uuid[]);
