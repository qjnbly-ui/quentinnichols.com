BEGIN;

DO $$
DECLARE
  v_bucket_id CONSTANT text := 'quentinnicholswebsite';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = v_bucket_id
  ) THEN
    RAISE EXCEPTION
      'Bucket "%" does not exist. No changes were made.',
      v_bucket_id;
  END IF;

  INSERT INTO storage.objects (bucket_id, name, metadata)
  VALUES
    (v_bucket_id, 'photography/.keep', '{"mimetype":"text/plain","size":0}'::jsonb),
    (v_bucket_id, 'photography/landscapes/.keep', '{"mimetype":"text/plain","size":0}'::jsonb),
    (v_bucket_id, 'photography/portraits/.keep', '{"mimetype":"text/plain","size":0}'::jsonb)
  ON CONFLICT (bucket_id, name) DO NOTHING;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Allow public read of quentinnicholswebsite'
  ) THEN
    CREATE POLICY "Allow public read of quentinnicholswebsite"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (bucket_id = 'quentinnicholswebsite');
  END IF;
END
$$;

COMMIT;
