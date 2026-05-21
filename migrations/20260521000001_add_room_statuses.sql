-- Add new room statuses for POS-focused room management
-- Use DO block because ALTER TYPE ... ADD VALUE cannot run in a transaction
-- (migrations run inside a backend-managed transaction)
DO $$ BEGIN
  ALTER TYPE room_status ADD VALUE 'booked';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE room_status ADD VALUE 'partial_paid';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TYPE room_status ADD VALUE 'fully_paid';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
