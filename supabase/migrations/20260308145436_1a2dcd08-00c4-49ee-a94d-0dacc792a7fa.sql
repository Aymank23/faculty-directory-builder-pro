
-- Allow authenticated users to upload files to the evidence bucket
CREATE POLICY "Users can upload evidence files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'evidence');

-- Allow authenticated users to read evidence files
CREATE POLICY "Users can read evidence files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'evidence');

-- Allow authenticated users to update their own evidence files
CREATE POLICY "Users can update evidence files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'evidence')
WITH CHECK (bucket_id = 'evidence');

-- Allow authenticated users to delete their own evidence files
CREATE POLICY "Users can delete evidence files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'evidence');
