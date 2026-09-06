-- 1. Archive metadata on the upload record
ALTER TABLE public.cv_uploads
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS content_hash text,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS cv_uploads_faculty_version_idx
  ON public.cv_uploads (faculty_id, version DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_uploads TO authenticated;
GRANT ALL ON public.cv_uploads TO service_role;

-- 2. Private archive bucket policies. Object path convention: <faculty_id>/<version>-<file name>
DROP POLICY IF EXISTS cv_archive_select ON storage.objects;
DROP POLICY IF EXISTS cv_archive_insert ON storage.objects;
DROP POLICY IF EXISTS cv_archive_update ON storage.objects;
DROP POLICY IF EXISTS cv_archive_delete ON storage.objects;

CREATE POLICY cv_archive_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cv-archive'
    AND public.can_view_faculty(NULLIF(split_part(name, '/', 1), '')::uuid)
  );

CREATE POLICY cv_archive_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cv-archive'
    AND public.can_edit_faculty(NULLIF(split_part(name, '/', 1), '')::uuid)
  );

CREATE POLICY cv_archive_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'cv-archive' AND public.is_admin())
  WITH CHECK (bucket_id = 'cv-archive' AND public.is_admin());

-- Archived originals are audit evidence: only administrators may remove them.
CREATE POLICY cv_archive_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'cv-archive' AND public.is_admin());