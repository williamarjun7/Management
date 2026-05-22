CREATE TABLE IF NOT EXISTS room_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  website_room_id text NOT NULL,
  website_room_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(pos_room_id),
  UNIQUE(website_room_id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
  event_type text NOT NULL,
  entity_type text NOT NULL DEFAULT 'booking',
  entity_id text,
  external_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  request_body jsonb,
  response_body jsonb,
  error_message text,
  retry_count int DEFAULT 0,
  max_retries int DEFAULT 3,
  last_synced_at timestamptz DEFAULT now(),
  source text NOT NULL DEFAULT 'website',
  idempotency_key text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_direction ON sync_logs(direction);
CREATE INDEX IF NOT EXISTS idx_sync_logs_event_type ON sync_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity ON sync_logs(entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_external ON sync_logs(external_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_idempotency ON sync_logs(idempotency_key);

CREATE TABLE IF NOT EXISTS sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_log_id uuid REFERENCES sync_logs(id) ON DELETE SET NULL,
  direction text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  retry_count int DEFAULT 0,
  max_retries int DEFAULT 5,
  next_retry_at timestamptz DEFAULT now(),
  last_error text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_retry ON sync_queue(next_retry_at);

CREATE TABLE IF NOT EXISTS external_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  source text NOT NULL,
  external_booking_id text NOT NULL,
  last_sync_status text,
  last_sync_at timestamptz,
  sync_metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(source, external_booking_id)
);

CREATE INDEX IF NOT EXISTS idx_ext_bookings_pos ON external_bookings(pos_booking_id);
CREATE INDEX IF NOT EXISTS idx_ext_bookings_source ON external_bookings(source, external_booking_id);
