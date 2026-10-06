
-- 1. CV update -> canonical controlled sync
CREATE OR REPLACE FUNCTION public.tg_legacy_ic_update_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  cid uuid; c public.canonical_ics; cj jsonb; o jsonb := to_jsonb(OLD); n jsonb := to_jsonb(NEW);
  me uuid := public.current_app_user_id(); proposer uuid;
  pairs text[][] := ARRAY[
    ARRAY['title','title','safe'], ARRAY['apa_citation','apa_citation','safe'], ARRAY['year','year','safe'],
    ARRAY['journal_outlet','journal_outlet','safe'], ARRAY['doi','doi','safe'], ARRAY['impact_factor','impact_factor','safe'],
    ARRAY['indexing_database','indexing_database','safe'], ARRAY['authors','authors','material'],
    ARRAY['quartile','quartile','material'], ARRAY['abdc_rank','abdc_rank','material'],
    ARRAY['ic_category','scholarship_portfolio','material'], ARRAY['ic_reporting_type','historical_reporting_type','material']];
  p text[]; lf text; cf text; kind text; ov text; nv text; cv text; why text;
  shared boolean; applied jsonb := '{}'::jsonb; proposed jsonb := '{}'::jsonb; skipped jsonb := '{}'::jsonb;
BEGIN
  SELECT canonical_ic_id INTO cid FROM public.legacy_ic_link WHERE legacy_ic_id = NEW.ic_id;
  IF cid IS NULL THEN
    IF OLD.record_class = 'ic' OR NEW.record_class = 'ic' THEN
      INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
      VALUES (me, 'legacy_update_unlinked', 'intellectual_contributions', NEW.ic_id::text,
              jsonb_build_object('note','Legacy record not yet migrated to canonical; no sync performed'));
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO c FROM public.canonical_ics WHERE id = cid;
  cj := to_jsonb(c);
  SELECT coalesce(me, (SELECT f.user_id FROM public.faculty_profiles f WHERE f.faculty_id = NEW.faculty_id), c.created_by) INTO proposer;
  shared := (SELECT count(*) FROM public.ic_authors WHERE canonical_ic_id = cid AND link_status = 'confirmed') > 1;

  -- classification change (IC -> AE) is always a proposal
  IF OLD.record_class = 'ic' AND NEW.record_class IS DISTINCT FROM 'ic' THEN
    IF proposer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.canonical_ic_change_requests WHERE canonical_ic_id = cid AND field='historical_reporting_type' AND new_value='Not Applicable' AND status='pending') THEN
      INSERT INTO public.canonical_ic_change_requests(canonical_ic_id, proposed_by, field, old_value, new_value, reason)
      VALUES (cid, proposer, 'historical_reporting_type', c.historical_reporting_type, 'Not Applicable', 'CV update re-classified this item as Academic Engagement (record_class '||coalesce(NEW.record_class,'?')||'); reviewer to confirm');
    END IF;
    proposed := proposed || jsonb_build_object('record_class', jsonb_build_object('before', OLD.record_class, 'after', NEW.record_class));
  END IF;

  FOREACH p SLICE 1 IN ARRAY pairs LOOP
    lf := p[1]; cf := p[2]; kind := p[3];
    ov := o->>lf; nv := n->>lf; cv := cj->>cf;
    CONTINUE WHEN ov IS NOT DISTINCT FROM nv;            -- field not changed by this CV update
    CONTINUE WHEN NULLIF(btrim(coalesce(nv,'')),'') IS NULL; -- never blank a canonical value from a CV
    IF cv IS NOT DISTINCT FROM nv THEN skipped := skipped || jsonb_build_object(cf,'already_equal'); CONTINUE; END IF;
    why := NULL;
    IF c.verification_status = 'verified' THEN why := 'record is verified';
    ELSIF shared THEN why := 'shared publication (2+ confirmed AKSOB authors)';
    ELSIF kind = 'material' THEN why := 'material reporting/authorship/classification field';
    ELSIF cv IS DISTINCT FROM ov THEN why := 'canonical value was manually reviewed/corrected';
    ELSIF cf = 'doi' AND EXISTS (SELECT 1 FROM public.canonical_ics x WHERE x.id <> cid AND public.norm_doi(x.doi) = public.norm_doi(nv)) THEN why := 'new DOI matches another canonical IC (possible duplicate)';
    ELSIF cf IN ('title','year') AND EXISTS (SELECT 1 FROM public.canonical_ics x WHERE x.id <> cid
          AND public.norm_title_key(x.title) = public.norm_title_key(CASE WHEN cf='title' THEN nv ELSE c.title END)
          AND x.year IS NOT DISTINCT FROM (CASE WHEN cf='year' THEN nv::int ELSE c.year END)) THEN why := 'new title/year matches another canonical IC (possible duplicate)';
    END IF;
    IF why IS NULL THEN
      EXECUTE format('UPDATE public.canonical_ics SET %I = $1::%s WHERE id = $2', cf, CASE WHEN cf='year' THEN 'integer' ELSE 'text' END) USING nv, cid;
      applied := applied || jsonb_build_object(cf, jsonb_build_object('before', cv, 'after', nv, 'import_before', ov));
    ELSE
      IF proposer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.canonical_ic_change_requests WHERE canonical_ic_id = cid AND field = cf AND new_value IS NOT DISTINCT FROM nv AND status='pending') THEN
        INSERT INTO public.canonical_ic_change_requests(canonical_ic_id, proposed_by, field, old_value, new_value, reason)
        VALUES (cid, proposer, cf, cv, nv, 'CV update: '||why);
      END IF;
      proposed := proposed || jsonb_build_object(cf, jsonb_build_object('current', cv, 'proposed', nv, 'import_before', ov, 'reason', why));
    END IF;
  END LOOP;

  IF applied <> '{}'::jsonb OR proposed <> '{}'::jsonb OR skipped <> '{}'::jsonb THEN
    INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
    VALUES (me, 'canonical_sync_from_legacy_update', 'canonical_ics', cid::text,
            jsonb_build_object('legacy_ic_id', NEW.ic_id, 'applied', applied, 'proposed', proposed, 'skipped', skipped));
  END IF;
  RETURN NEW;
END $fn$;
REVOKE EXECUTE ON FUNCTION public.tg_legacy_ic_update_sync() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_legacy_ic_update_sync ON public.intellectual_contributions;
CREATE TRIGGER trg_legacy_ic_update_sync AFTER UPDATE ON public.intellectual_contributions
FOR EACH ROW EXECUTE FUNCTION public.tg_legacy_ic_update_sync();

-- 2. find_canonical_matches: minimum disclosure
CREATE OR REPLACE FUNCTION public.find_canonical_matches(_doi text, _title text, _year integer)
 RETURNS TABLE(id uuid, title text, year integer, journal_outlet text, doi text, authors text, match_method text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF public.current_app_user_id() IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF public.norm_doi(_doi) IS NULL AND length(coalesce(public.norm_title_key(_title),'')) < 12 THEN RETURN; END IF;
  RETURN QUERY
  SELECT m.id, m.title, m.year, m.journal_outlet,
         CASE WHEN public.can_view_canonical_ic(m.id) THEN m.doi END,
         CASE WHEN public.can_view_canonical_ic(m.id) THEN m.authors END,
         m.mm
  FROM (
    SELECT c.id, c.title, c.year, c.journal_outlet, c.doi, c.authors, 'doi'::text mm
      FROM public.canonical_ics c
     WHERE public.norm_doi(_doi) IS NOT NULL AND public.norm_doi(c.doi) = public.norm_doi(_doi)
    UNION
    SELECT c.id, c.title, c.year, c.journal_outlet, c.doi, c.authors, 'title_year'::text
      FROM public.canonical_ics c
     WHERE public.norm_title_key(_title) IS NOT NULL
       AND public.norm_title_key(c.title) = public.norm_title_key(_title)
       AND (c.year IS NOT DISTINCT FROM _year)
       AND NOT (public.norm_doi(_doi) IS NOT NULL AND public.norm_doi(c.doi) = public.norm_doi(_doi))
  ) m LIMIT 5;
END $function$;

-- 3. submit_canonical_contribution: link must genuinely match + daily rate limit
CREATE OR REPLACE FUNCTION public.submit_canonical_contribution(_faculty_id uuid, _payload jsonb, _link_to uuid DEFAULT NULL::uuid, _confirm_not_duplicate boolean DEFAULT false)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := public.current_app_user_id(); admin boolean := public.is_admin(); dept text; new_id uuid;
  v_doi text := NULLIF(trim(_payload->>'doi'), ''); v_title text := NULLIF(trim(_payload->>'title'), '');
  v_year int := NULLIF(_payload->>'year','')::int; dup_doi uuid; dup_ty uuid; t public.canonical_ics;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (admin OR EXISTS (SELECT 1 FROM public.faculty_profiles f WHERE f.faculty_id = _faculty_id AND f.user_id = me)) THEN
    RAISE EXCEPTION 'NOT_PERMITTED: you can only add contributions to your own profile';
  END IF;
  IF NOT admin AND (SELECT count(*) FROM public.audit_log WHERE user_id = me AND action IN ('canonical_author_link_proposed','canonical_ic_created') AND created_at > now() - interval '1 day') >= 30 THEN
    RAISE EXCEPTION 'RATE_LIMITED: daily submission limit reached; contact an admin';
  END IF;
  SELECT department INTO dept FROM public.faculty_profiles WHERE faculty_id = _faculty_id;

  IF _link_to IS NOT NULL THEN
    SELECT * INTO t FROM public.canonical_ics WHERE id = _link_to;
    IF NOT FOUND THEN RAISE EXCEPTION 'MATCH_NOT_FOUND'; END IF;
    IF NOT admin AND NOT (
         (public.norm_doi(v_doi) IS NOT NULL AND public.norm_doi(t.doi) = public.norm_doi(v_doi))
      OR (public.norm_title_key(v_title) IS NOT NULL AND public.norm_title_key(t.title) = public.norm_title_key(v_title) AND t.year IS NOT DISTINCT FROM v_year)) THEN
      RAISE EXCEPTION 'MATCH_MISMATCH: you can only link to a publication matching your DOI or title and year';
    END IF;
    INSERT INTO public.ic_authors(canonical_ic_id, faculty_id, department_snapshot, link_status)
    VALUES (_link_to, _faculty_id, dept, 'proposed') ON CONFLICT (canonical_ic_id, faculty_id) DO NOTHING;
    INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
    VALUES (me, 'canonical_author_link_proposed', 'canonical_ics', _link_to::text,
            jsonb_build_object('faculty_id', _faculty_id, 'source', 'add_contribution', 'submitted', _payload));
    RETURN _link_to;
  END IF;

  IF v_title IS NULL THEN RAISE EXCEPTION 'TITLE_REQUIRED'; END IF;
  SELECT c.id INTO dup_doi FROM public.canonical_ics c WHERE v_doi IS NOT NULL AND public.norm_doi(c.doi) = public.norm_doi(v_doi) LIMIT 1;
  IF dup_doi IS NOT NULL THEN RAISE EXCEPTION 'DUPLICATE_DOI: a publication with this DOI already exists (%). Link to it instead.', dup_doi; END IF;
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
  VALUES (new_id, _faculty_id, dept, CASE WHEN admin THEN 'confirmed' ELSE 'proposed' END, CASE WHEN admin THEN me END, CASE WHEN admin THEN now() END);
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (me, 'canonical_ic_created', 'canonical_ics', new_id::text,
          jsonb_build_object('faculty_id', _faculty_id, 'source', coalesce(_payload->>'source','add_contribution'),
                             'possible_duplicate_overridden', dup_ty, 'submitted', _payload));
  RETURN new_id;
END $function$;

-- 4. attach_canonical_evidence: server-side path, type, size and existence checks
CREATE OR REPLACE FUNCTION public.attach_canonical_evidence(_id uuid, _path text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE me uuid := public.current_app_user_id(); prev text; obj record; owner_fid text;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'NOT_AUTHENTICATED'; END IF;
  IF NOT (public.is_admin() OR EXISTS (
      SELECT 1 FROM public.ic_authors a JOIN public.faculty_profiles f ON f.faculty_id = a.faculty_id
       WHERE a.canonical_ic_id = _id AND a.link_status <> 'rejected' AND f.user_id = me)) THEN
    RAISE EXCEPTION 'NOT_PERMITTED';
  END IF;
  IF _path IS NULL OR _path ~ '\.\.' OR _path !~* '^[0-9a-f-]{36}/[^/]+\.(pdf|docx?|png|jpe?g)$' THEN
    RAISE EXCEPTION 'INVALID_EVIDENCE_PATH: allowed types are PDF, Word, PNG or JPG';
  END IF;
  owner_fid := split_part(_path, '/', 1);
  IF NOT EXISTS (SELECT 1 FROM public.ic_authors a WHERE a.canonical_ic_id = _id AND a.faculty_id::text = owner_fid AND a.link_status <> 'rejected') THEN
    RAISE EXCEPTION 'INVALID_EVIDENCE_PATH: file must be stored under a linked author of this publication';
  END IF;
  IF NOT public.is_admin() AND NOT EXISTS (SELECT 1 FROM public.faculty_profiles f WHERE f.faculty_id::text = owner_fid AND f.user_id = me) THEN
    RAISE EXCEPTION 'INVALID_EVIDENCE_PATH: file must be in your own evidence folder';
  END IF;
  SELECT o.metadata INTO obj FROM storage.objects o WHERE o.bucket_id = 'evidence' AND o.name = _path;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVIDENCE_NOT_FOUND: upload the file first'; END IF;
  IF coalesce((obj.metadata->>'size')::bigint, 0) > 10485760 THEN RAISE EXCEPTION 'EVIDENCE_TOO_LARGE: maximum 10 MB'; END IF;
  IF obj.metadata->>'mimetype' IS NOT NULL AND obj.metadata->>'mimetype' !~* '^(application/pdf|application/msword|application/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|image/png|image/jpeg)$' THEN
    RAISE EXCEPTION 'INVALID_EVIDENCE_TYPE: allowed types are PDF, Word, PNG or JPG';
  END IF;
  SELECT evidence_file_url INTO prev FROM public.canonical_ics WHERE id = _id;
  IF prev IS NOT NULL AND NOT public.is_admin() AND public.confirmed_author_count(_id) > 1 THEN
    RAISE EXCEPTION 'SHARED_IC_PROPOSAL_REQUIRED: evidence already exists on a shared publication; ask an admin to replace it';
  END IF;
  UPDATE public.canonical_ics SET evidence_file_url = _path, evidence_status = 'uploaded',
         verification_status = CASE WHEN verification_status = 'verified' AND NOT public.is_admin() THEN 'under_review' ELSE verification_status END
   WHERE id = _id;
  INSERT INTO public.audit_log(user_id, action, target_table, target_record, details)
  VALUES (me, 'canonical_evidence_attached', 'canonical_ics', _id::text, jsonb_build_object('path', _path, 'previous', prev, 'mimetype', obj.metadata->>'mimetype', 'size', obj.metadata->>'size'));
END $function$;
