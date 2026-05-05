-- Create the profile-photos storage bucket as public so photos can be
-- served via getPublicUrl without signed tokens.
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload profile photos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users upload profile photos'
  ) THEN
    CREATE POLICY "Authenticated users upload profile photos"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'profile-photos' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Allow authenticated users to overwrite (upsert) profile photos.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Authenticated users update profile photos'
  ) THEN
    CREATE POLICY "Authenticated users update profile photos"
      ON storage.objects FOR UPDATE
      USING (bucket_id = 'profile-photos' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- Allow public (unauthenticated) read access so the stored URL renders
-- in <img> tags without needing signed tokens.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Public read profile photos'
  ) THEN
    CREATE POLICY "Public read profile photos"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'profile-photos');
  END IF;
END $$;
