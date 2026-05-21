-- ============================================================
-- Migration: Remove QR Architecture, Add Workflow Infrastructure
-- ============================================================

-- ─── 1. REMOVE QR-RELATED COLUMNS AND TABLES ───

-- Remove qr_code_url from restaurant_tables
ALTER TABLE restaurant_tables DROP COLUMN IF EXISTS qr_code_url;

-- Remove qr_session_id from orders
ALTER TABLE orders DROP COLUMN IF EXISTS qr_session_id;

-- Drop QR sessions table
DROP TABLE IF EXISTS qr_sessions CASCADE;

-- Drop QR session RPC
DROP FUNCTION IF EXISTS create_qr_session;

-- ─── 2. UPDATE restaurant_tables STATUS ENUM ───

-- The status column currently uses text; ensure it allows new states
-- If there's a constraint, drop and recreate
ALTER TABLE restaurant_tables DROP CONSTRAINT IF EXISTS restaurant_tables_status_check;

-- ─── 3. CREATE TABLE SESSIONS ───

CREATE TABLE IF NOT EXISTS table_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id UUID NOT NULL REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'closed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_table_id ON table_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_staff_id ON table_sessions(staff_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_status ON table_sessions(status);

-- ─── 4. CREATE WORKFLOW STATE TABLE ───

CREATE TABLE IF NOT EXISTS workflow_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  current_step TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'cancelled')),
  context JSONB DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_state_entity ON workflow_state(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_workflow_state_status ON workflow_state(status);

-- ─── 5. CREATE WORKFLOW LOGS TABLE ───

CREATE TABLE IF NOT EXISTS workflow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow_state(id) ON DELETE CASCADE,
  from_step TEXT,
  to_step TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_logs_workflow_id ON workflow_logs(workflow_id);

-- ─── 6. CREATE TRANSITION HISTORY TABLE ───

CREATE TABLE IF NOT EXISTS transition_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  from_state TEXT,
  to_state TEXT NOT NULL,
  triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transition_history_entity ON transition_history(entity_type, entity_id);

-- ─── 7. ENABLE RLS ───

ALTER TABLE table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transition_history ENABLE ROW LEVEL SECURITY;

-- ─── 8. RLS POLICIES ───

-- Table sessions: staff can read/write active sessions for their tables
CREATE POLICY "staff_read_table_sessions" ON table_sessions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "staff_insert_table_sessions" ON table_sessions
  FOR INSERT TO authenticated WITH CHECK (
    staff_id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

CREATE POLICY "staff_update_table_sessions" ON table_sessions
  FOR UPDATE TO authenticated USING (
    staff_id = auth.uid()
    OR EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'manager'))
  );

-- Workflow state: all authenticated can read
CREATE POLICY "authenticated_read_workflow_state" ON workflow_state
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_workflow_state" ON workflow_state
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "authenticated_update_workflow_state" ON workflow_state
  FOR UPDATE TO authenticated USING (true);

-- Workflow logs: all authenticated can read/insert
CREATE POLICY "authenticated_read_workflow_logs" ON workflow_logs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_workflow_logs" ON workflow_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- Transition history: all authenticated can read/insert
CREATE POLICY "authenticated_read_transition_history" ON transition_history
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated_insert_transition_history" ON transition_history
  FOR INSERT TO authenticated WITH CHECK (true);

-- ─── 9. CREATE RPC FOR SYSTEM EVENTS ───

CREATE OR REPLACE FUNCTION create_system_event(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_payload JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id::TEXT, p_payload)
  RETURNING id INTO v_id;

  -- Notify via Postgres channel for realtime
  PERFORM pg_notify(
    'notifications',
    json_build_object(
      'event_type', p_event_type,
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'payload', p_payload
    )::text
  );

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 10. ADD INDEXES FOR NEW WORKFLOW QUERIES ───

CREATE INDEX IF NOT EXISTS idx_orders_table_id_status ON orders(table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
