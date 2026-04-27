-- Main Supabase SQL script (idempotent / rerunnable).
--
-- Pattern for future additions:
-- 1) Add a clearly labeled section.
-- 2) Make each section idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- 3) Avoid destructive operations unless intentionally required.

BEGIN;

-- ---------------------------------------------------------------------------
-- Section: Storage folder placeholders
-- Scope: Only inserts storage.objects rows for these paths:
--   quentinnichols.com/photography/.keep
--   quentinnichols.com/photography/landscapes/.keep
--   quentinnichols.com/photography/portraits/.keep
--
-- IMPORTANT:
-- Replace REPLACE_WITH_EXISTING_BUCKET_ID with your actual existing bucket id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bucket_id CONSTANT text := 'quentinnichols.com';
  v_root CONSTANT text := 'quentinnichols.com';
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
    (v_bucket_id, v_root || '/photography/.keep', '{"mimetype":"text/plain","size":0}'::jsonb),
    (v_bucket_id, v_root || '/photography/landscapes/.keep', '{"mimetype":"text/plain","size":0}'::jsonb),
    (v_bucket_id, v_root || '/photography/portraits/.keep', '{"mimetype":"text/plain","size":0}'::jsonb)
  ON CONFLICT (bucket_id, name) DO NOTHING;
END
$$;

COMMIT;
