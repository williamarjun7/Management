-- Add new room statuses for POS-focused room management
-- room_status is a PostgreSQL enum, so we need ALTER TYPE
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'booked';
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'partial_paid';
ALTER TYPE room_status ADD VALUE IF NOT EXISTS 'fully_paid';
