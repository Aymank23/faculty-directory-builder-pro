
-- Normalised title key used for duplicate detection (alphanumerics only).
CREATE OR REPLACE FUNCTION public.norm_title_key(v text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT NULLIF(regexp_replace(lower(coalesce(v,'')), '[^a-z0-9]+', '', 'g'), '');
$$;

-- Duplicate suggestions: DOI first, then normalised title + year.
CREATE OR REPLACE FUNCTION public.find_canonical_matches(_doi text, _title text, _year integer)
RETURNS TABLE(id uuid, title text, year integer, journal_outlet text, doi text, authors text, match_method text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.current_app_user_id() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  RETURN QUERY
  SELECT c.id, c.title, c.year, c.journal_outlet, c.doi, c.authors, 'doi'::text
    FROM public.canonical_ics c
   WHERE public.norm_doi(_doi) IS NOT NULL AND public.norm_doi(c.doi) = public.norm_doi(_doi)
  UNION
  SELECT c.id, c.title, c.year, c.journal_outlet, c.doi, c.authors, 'title_year'::text
    FROM public.canonical_ics c
   WHERE public.norm_title_key(_title) IS NOT NULL
     AND public.norm_title_key(c.title) = public.norm_title_key(_title)
     AND (c.year IS NOT DISTINCT FROM _year)
     AND NOT (public.norm_doi(_doi) IS NOT NULL AND public.norm_doi(c.doi) = public.norm_doi(_doi))
  LIMIT 10;
END $$;
REVOKE ALL ON FUNCTION public.find_canonical_matches(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_canonical_matches(text, text, integer) TO authenticated;

-- Single creation path for faculty-entered ICs.
CREATE OR REPLACE FUNCTION public.submit_canonical_contribution(_faculty_id uuid, _payload jsonb, _link_to uuid DEFAULT NULL, _confirm_not_duplicate boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me uuid := public.current_app_user_id();
  admin boolean := public.is_admin();
  dept text;
  new_id uuid;
  v_doi text := NULLIF(trim(_payload->>'doi'), '');
  v_title text := NULLIF(trim(_payload->>'title'), '');
  v_year int := NULLIF(_payload->>'year','')::int;
  dup_doi uuid;
  dup_ty uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (admin OR EXISTS (SELECT 1 FROM public.faculty_profiles f WHERE f.faculty_id = _faculty_id AND f.user_id = me)) THEN
    RAISE EXCEPTION 'NOT_PERMITTED: you can only add contributions to your own profile';
  END IF;
  SELECT department INTO dept FROM public.faculty_profiles WHERE faculty_id = _faculty_id;

  IF _link_to IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.canonical_ics WHERE id = _link_to) THEN RAISE EXCEPTION 'MATCH_NOT_FOUND'; END IF;
    INSERT INTO public.ic_authors(canonical_ic_id, faculty_id, department_snapshot, link_status)
    VALUES (_link_to, _faculty_id, dept, 'proposed')
    ON CONFLICT (canonical_ic_id, faculty_id) DO NOTHING;
    INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
    VALUES (me, 'canonical_author_link_proposed', 'canonical_ics', _link_to::text,
            jsonb_build_object('faculty_id', _faculty_id, 'source', 'add_contribution', 'submitted', _payload));
    RETURN _link_to;
  END IF;

  IF v_title IS NULL THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
  SELECT c.id INTO dup_doi FROM public.canonical_ics c WHERE v_doi IS NOT NULL AND public.norm_doi(c.doi) = public.norm_doi(v_doi) LIMIT 1;
  IF dup_doi IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_DOI: a publication with this DOI already exists (%). Link to it instead.', dup_doi;
  END IF;
  SELECT c.id INTO dup_ty FROM public.canonical_ics c
   WHERE public.norm_title_key(c.title) = public.norm_title_key(v_title) AND c.year IS NOT DISTINCT FROM v_year LIMIT 1;
  IF dup_ty IS NOT NULL AND NOT _confirm_not_duplicate THEN
    RAISE EXCEPTION 'POSSIBLE_DUPLICATE: a publication with the same title and year exists (%).', dup_ty;
  END IF;

  INSERT INTO public.canonical_ics(title, apa_citation, year, journal_outlet, doi, authors, total_authors, quartile, abdc_rank,
      impact_factor, indexing_database, scholarship_portfolio, historical_reporting_type, original_cv_item_type, activity_type,
      verification_status, eligibility, condition_note, canonical_key, created_by)
  VALUES (v_title, NULLIF(_payload->>'apa_citation',''), v_year, NULLIF(_payload->>'journal_outlet',''), v_doi,
      NULLIF(_payload->>'authors',''), NULLIF(_payload->>'total_authors','')::int, NULLIF(_payload->>'quartile',''),
      NULLIF(_payload->>'abdc_rank',''), NULLIF(_payload->>'impact_factor',''), NULLIF(_payload->>'indexing_database',''),
      NULLIF(_payload->>'scholarship_portfolio',''), coalesce(NULLIF(_payload->>'historical_reporting_type',''), 'Needs Review'),
      coalesce(NULLIF(_payload->>'original_cv_item_type',''), 'Manual entry (Add Contribution)'), NULLIF(_payload->>'activity_type',''),
      'under_review', 'conditional', 'New faculty entry — awaiting review',
      CASE WHEN v_doi IS NOT NULL THEN 'doi:'||public.norm_doi(v_doi) ELSE 'ty:'||coalesce(public.norm_title_key(v_title),'')||':'||coalesce(v_year::text,'') END,
      me)
  RETURNING id INTO new_id;

  INSERT INTO public.ic_authors(canonical_ic_id, faculty_id, department_snapshot, link_status, confirmed_by, confirmed_at)
  VALUES (new_id, _faculty_id, dept, CASE WHEN admin THEN 'confirmed' ELSE 'proposed' END,
          CASE WHEN admin THEN me END, CASE WHEN admin THEN now() END);

  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (me, 'canonical_ic_created', 'canonical_ics', new_id::text,
          jsonb_build_object('faculty_id', _faculty_id, 'source', coalesce(_payload->>'source','add_contribution'),
                             'possible_duplicate_overridden', dup_ty, 'submitted', _payload));
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION public.submit_canonical_contribution(uuid, jsonb, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_canonical_contribution(uuid, jsonb, uuid, boolean) TO authenticated;

-- Evidence attachment for a linked author.
CREATE OR REPLACE FUNCTION public.attach_canonical_evidence(_id uuid, _path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := public.current_app_user_id(); prev text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.is_admin() OR EXISTS (
      SELECT 1 FROM public.ic_authors a JOIN public.faculty_profiles f ON f.faculty_id = a.faculty_id
       WHERE a.canonical_ic_id = _id AND a.link_status <> 'rejected' AND f.user_id = me)) THEN
    RAISE EXCEPTION 'NOT_PERMITTED';
  END IF;
  SELECT evidence_file_url INTO prev FROM public.canonical_ics WHERE id = _id;
  IF prev IS NOT NULL AND NOT public.is_admin() AND public.confirmed_author_count(_id) > 1 THEN
    RAISE EXCEPTION 'SHARED_IC_PROPOSAL_REQUIRED: evidence already exists on a shared publication; ask an admin to replace it';
  END IF;
  UPDATE public.canonical_ics SET evidence_file_url = _path, evidence_status = 'uploaded',
         verification_status = CASE WHEN verification_status = 'verified' AND NOT public.is_admin() THEN 'under_review' ELSE verification_status END
   WHERE id = _id;
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (me, 'canonical_evidence_attached', 'canonical_ics', _id::text, jsonb_build_object('path', _path, 'previous', prev));
END $$;
REVOKE ALL ON FUNCTION public.attach_canonical_evidence(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_canonical_evidence(uuid, text) TO authenticated;

-- Controlled synchronisation: any new legacy IC row (CV upload, import) enters the canonical model.
CREATE OR REPLACE FUNCTION public.tg_legacy_ic_to_canonical()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cid uuid; method text; dept text; admin boolean := (auth.uid() IS NULL OR public.is_admin());
BEGIN
  IF NEW.record_class IS DISTINCT FROM 'ic' OR NEW.faculty_id IS NULL OR NULLIF(trim(NEW.title),'') IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.legacy_ic_link WHERE legacy_ic_id = NEW.ic_id) THEN RETURN NEW; END IF;
  SELECT department INTO dept FROM public.faculty_profiles WHERE faculty_id = NEW.faculty_id;
  SELECT c.id INTO cid FROM public.canonical_ics c WHERE public.norm_doi(NEW.doi) IS NOT NULL AND public.norm_doi(c.doi) = public.norm_doi(NEW.doi) LIMIT 1;
  IF cid IS NOT NULL THEN method := 'doi';
  ELSE
    SELECT c.id INTO cid FROM public.canonical_ics c
     WHERE public.norm_title_key(c.title) = public.norm_title_key(NEW.title) AND c.year IS NOT DISTINCT FROM NEW.year LIMIT 1;
    IF cid IS NOT NULL THEN method := 'title_year'; END IF;
  END IF;
  IF cid IS NULL THEN
    method := 'single';
    INSERT INTO public.canonical_ics(title, apa_citation, year, journal_outlet, doi, authors, quartile, abdc_rank, impact_factor,
        indexing_database, scholarship_portfolio, historical_reporting_type, original_cv_item_type, activity_type,
        verification_status, eligibility, condition_note, evidence_file_url, evidence_status, canonical_key, created_by)
    VALUES (NEW.title, NEW.apa_citation, NEW.year, NEW.journal_outlet, NEW.doi, NEW.authors, NEW.quartile, NEW.abdc_rank, NEW.impact_factor,
        NEW.indexing_database, NEW.ic_category, coalesce(NEW.ic_reporting_type, 'Needs Review'), NEW.original_cv_item_type, NEW.activity_type,
        'under_review', 'conditional', 'Imported from CV/legacy record — awaiting review', NEW.evidence_file_url, NEW.evidence_status,
        CASE WHEN public.norm_doi(NEW.doi) IS NOT NULL THEN 'doi:'||public.norm_doi(NEW.doi) ELSE 'ty:'||coalesce(public.norm_title_key(NEW.title),'')||':'||coalesce(NEW.year::text,'') END,
        public.current_app_user_id())
    RETURNING id INTO cid;
  END IF;
  INSERT INTO public.legacy_ic_link(legacy_ic_id, canonical_ic_id, match_method) VALUES (NEW.ic_id, cid, method);
  INSERT INTO public.ic_authors(canonical_ic_id, faculty_id, department_snapshot, link_status)
  VALUES (cid, NEW.faculty_id, dept, 'proposed') ON CONFLICT (canonical_ic_id, faculty_id) DO NOTHING;
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (public.current_app_user_id(), 'canonical_sync_from_legacy', 'canonical_ics', cid::text,
          jsonb_build_object('legacy_ic_id', NEW.ic_id, 'match_method', method, 'faculty_id', NEW.faculty_id));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_legacy_ic_to_canonical() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_legacy_ic_to_canonical ON public.intellectual_contributions;
CREATE TRIGGER trg_legacy_ic_to_canonical AFTER INSERT ON public.intellectual_contributions
FOR EACH ROW EXECUTE FUNCTION public.tg_legacy_ic_to_canonical();
