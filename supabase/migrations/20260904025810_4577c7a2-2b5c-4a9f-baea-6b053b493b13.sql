DROP POLICY IF EXISTS "evidence_select" ON storage.objects;
DROP POLICY IF EXISTS "evidence_insert" ON storage.objects;
DROP POLICY IF EXISTS "evidence_update" ON storage.objects;
DROP POLICY IF EXISTS "evidence_delete" ON storage.objects;

CREATE POLICY "evidence_select" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidence');
CREATE POLICY "evidence_insert" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence');
CREATE POLICY "evidence_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'evidence') WITH CHECK (bucket_id = 'evidence');
CREATE POLICY "evidence_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'evidence');