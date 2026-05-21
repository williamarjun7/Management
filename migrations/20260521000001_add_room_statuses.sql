-- Add new room statuses for POS-focused room management
ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_status_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_status_check
  CHECK (status IN ('available', 'reserved', 'booked', 'occupied', 'partial_paid', 'fully_paid', 'cleaning', 'maintenance'));

-- Update RLS policies to allow new statuses (existing policies already cover all statuses)
