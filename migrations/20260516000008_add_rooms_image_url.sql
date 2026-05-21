ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'rooms' AND indexname = 'idx_rooms_image_url'
  ) THEN
    CREATE INDEX idx_rooms_image_url ON rooms(image_url);
  END IF;
END $$;
