-- Fix storage.objects RLS for cafe-images bucket.
-- Error was: "new row violates row-level security policy for table 'objects'"
-- because no INSERT policy existed on storage.objects for authenticated users.
-- Schema note: column is `bucket` (not `bucket_id`), owner column is `uploaded_by`.

-- Drop any auto-installed owner-only defaults that would conflict
DROP POLICY IF EXISTS storage_objects_owner_select ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_insert ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_update ON storage.objects;
DROP POLICY IF EXISTS storage_objects_owner_delete ON storage.objects;

-- Allow authenticated users to read any file in cafe-images (needed for menu/room images)
DROP POLICY IF EXISTS cafe_images_select ON storage.objects;
CREATE POLICY cafe_images_select ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (bucket = 'cafe-images');

-- Allow authenticated users to upload files to cafe-images
DROP POLICY IF EXISTS cafe_images_insert ON storage.objects;
CREATE POLICY cafe_images_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket = 'cafe-images'
    AND uploaded_by = (SELECT auth.jwt() ->> 'sub')
  );

-- Allow file owner to update their own files
DROP POLICY IF EXISTS cafe_images_update ON storage.objects;
CREATE POLICY cafe_images_update ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket = 'cafe-images' AND uploaded_by = (SELECT auth.jwt() ->> 'sub'))
  WITH CHECK (bucket = 'cafe-images' AND uploaded_by = (SELECT auth.jwt() ->> 'sub'));

-- Allow file owner to delete their own files
DROP POLICY IF EXISTS cafe_images_delete ON storage.objects;
CREATE POLICY cafe_images_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket = 'cafe-images' AND uploaded_by = (SELECT auth.jwt() ->> 'sub'));

-- Grant necessary permissions
GRANT USAGE ON SCHEMA storage TO authenticated, anon;
GRANT SELECT ON storage.objects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
