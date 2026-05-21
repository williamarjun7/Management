ALTER TABLE room_types ADD COLUMN IF NOT EXISTS image_url TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'room_types' AND indexname = 'idx_room_types_image_url'
  ) THEN
    CREATE INDEX idx_room_types_image_url ON room_types(image_url);
  END IF;
END $$;
