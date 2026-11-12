-- Phase 6: school-wide canonicalisation of legacy ICs (additive + backfill). All records stay Under Review.
CREATE TABLE public.phase6_backup_intellectual_contributions AS SELECT * FROM public.intellectual_contributions;
CREATE TABLE public.phase6_backup_canonical_ics AS SELECT * FROM public.canonical_ics;
CREATE TABLE public.phase6_backup_ic_authors AS SELECT * FROM public.ic_authors;
CREATE TABLE public.phase6_backup_legacy_ic_link AS SELECT * FROM public.legacy_ic_link;
GRANT ALL ON public.phase6_backup_intellectual_contributions, public.phase6_backup_canonical_ics, public.phase6_backup_ic_authors, public.phase6_backup_legacy_ic_link TO service_role;
ALTER TABLE public.phase6_backup_intellectual_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase6_backup_canonical_ics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase6_backup_ic_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phase6_backup_legacy_ic_link ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.canonical_ics ADD COLUMN IF NOT EXISTS migration_batch text;

DO $$
DECLARE r record; cid uuid; method text; dept text; n_new int := 0; n_linked int := 0;
BEGIN
  FOR r IN
    SELECT i.* FROM public.intellectual_contributions i
    LEFT JOIN public.legacy_ic_link l ON l.legacy_ic_id = i.ic_id
    WHERE i.record_class = 'ic' AND l.legacy_ic_id IS NULL AND i.faculty_id IS NOT NULL AND nullif(trim(i.title),'') IS NOT NULL
    ORDER BY i.created_at, i.ic_id
  LOOP
    SELECT department INTO dept FROM public.faculty_profiles WHERE faculty_id = r.faculty_id;
    cid := NULL; method := NULL;
    SELECT c.id INTO cid FROM public.canonical_ics c WHERE public.norm_doi(r.doi) IS NOT NULL AND public.norm_doi(c.doi) = public.norm_doi(r.doi) LIMIT 1;
    IF cid IS NOT NULL THEN method := 'doi';
    ELSE
      SELECT c.id INTO cid FROM public.canonical_ics c
       WHERE length(coalesce(public.norm_title_key(r.title),'')) >= 12
         AND public.norm_title_key(c.title) = public.norm_title_key(r.title) AND c.year IS NOT DISTINCT FROM r.year LIMIT 1;
      IF cid IS NOT NULL THEN method := 'title_year'; END IF;
    END IF;
    IF cid IS NULL THEN
      method := 'single';
      INSERT INTO public.canonical_ics(title, apa_citation, year, journal_outlet, doi, authors, quartile, abdc_rank, impact_factor,
          indexing_database, scholarship_portfolio, historical_reporting_type, original_cv_item_type, activity_type,
          verification_status, eligibility, condition_note, evidence_file_url, evidence_status, canonical_key, migration_batch)
      VALUES (r.title, r.apa_citation, r.year, r.journal_outlet, r.doi, r.authors, r.quartile, r.abdc_rank, r.impact_factor,
          r.indexing_database, r.ic_category, coalesce(nullif(r.ic_reporting_type,''), 'Needs Review'), r.original_cv_item_type, r.activity_type,
          'under_review',
          CASE WHEN nullif(r.ic_reporting_type,'') IS NULL OR r.ic_reporting_type = 'Needs Review' THEN 'conditional' ELSE 'include' END,
          CASE WHEN nullif(r.ic_reporting_type,'') IS NULL OR r.ic_reporting_type = 'Needs Review' THEN 'Phase 6 migration: reporting type needs review' END,
          r.evidence_file_url, r.evidence_status,
          CASE WHEN public.norm_doi(r.doi) IS NOT NULL THEN 'doi:'||public.norm_doi(r.doi) ELSE 'ty:'||coalesce(public.norm_title_key(r.title),'')||':'||coalesce(r.year::text,'') END,
          'phase6')
      RETURNING id INTO cid;
      INSERT INTO public.ic_authors(canonical_ic_id, faculty_id, department_snapshot, link_status, confirmed_at, review_note)
      VALUES (cid, r.faculty_id, dept, 'confirmed', now(), 'Phase 6 migration: own CV record');
      n_new := n_new + 1;
    ELSE
      -- matched an existing publication: co-author link is only proposed, an admin confirms
      INSERT INTO public.ic_authors(canonical_ic_id, faculty_id, department_snapshot, link_status, review_note)
      VALUES (cid, r.faculty_id, dept, 'proposed', 'Phase 6 migration: matched by '||method)
      ON CONFLICT (canonical_ic_id, faculty_id) DO NOTHING;
      n_linked := n_linked + 1;
    END IF;
    INSERT INTO public.legacy_ic_link(legacy_ic_id, canonical_ic_id, match_method) VALUES (r.ic_id, cid, method);
  END LOOP;
  INSERT INTO public.audit_log(action, target_table, details)
  VALUES ('phase6_schoolwide_migration', 'canonical_ics', jsonb_build_object('created', n_new, 'linked_to_existing', n_linked, 'status', 'all under_review'));
END $$;