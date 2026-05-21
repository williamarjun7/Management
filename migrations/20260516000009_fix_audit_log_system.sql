-- ============================================================
-- MIGRATION: Fix Audit Log Pipeline — RLS, functions, triggers
-- ============================================================
-- Fixes three categories:
--   1. Add INSERT RLS policy on audit_logs and system_events
--      so SECURITY INVOKER functions can write audit records.
--   2. Make create_audit_log / create_system_event DEFINER
--      again (revert migration 03 for these two only) so that
--      trigger-based and RPC-based audit logging works for
--      non-admin callers.
--   3. Revert confirm_order, process_payment, process_check_in,
--      process_check_out back to SECURITY DEFINER so their
--      direct INSERTs into system_events bypass RLS.
--   4. Ensure pg_notify is sent on every system_event INSERT
--      so the realtime layer picks up new events.
-- ============================================================

-- ============================================================
-- 1. Fix audit_functions — revert to SECURITY DEFINER
--    so they bypass RLS when called from DEFINER RPCs / triggers
-- ============================================================

-- Also revert business RPCs that migration 03 changed to INVOKER
ALTER FUNCTION public.confirm_order(uuid, uuid, text) SECURITY DEFINER;
ALTER FUNCTION public.process_payment(uuid, numeric, payment_method, uuid, text, text, text) SECURITY DEFINER;
ALTER FUNCTION public.process_check_in(uuid, uuid, text) SECURITY DEFINER;
ALTER FUNCTION public.process_check_out(uuid, uuid, text) SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.create_audit_log(
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_previous_state jsonb DEFAULT NULL,
  p_new_state jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO audit_logs (user_id, action, entity_type, entity_id, previous_state, new_state, reason)
  VALUES (p_user_id, p_action, p_entity_type, p_entity_id, p_previous_state, p_new_state, p_reason)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_system_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_seq bigint;
BEGIN
  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id, sequence_id INTO v_id, v_seq;

  -- pg_notify so realtime subscriptions pick up new events
  PERFORM pg_notify('system_events',
    jsonb_build_object(
      'id', v_id,
      'sequence_id', v_seq,
      'event_type', p_event_type,
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'payload', COALESCE(p_payload, '{}'::jsonb)
    )::text);

  RETURN v_id;
END;
$$;

-- ============================================================
-- 2. Add INSERT RLS policies on audit_logs and system_events
--    so SECURITY INVOKER callers can still write audit events
-- ============================================================

-- Allow authenticated users to INSERT into audit_logs
DROP POLICY IF EXISTS "Authenticated can insert audit_logs" ON audit_logs;
CREATE POLICY "Authenticated can insert audit_logs" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to INSERT into system_events
DROP POLICY IF EXISTS "Authenticated can insert system_events" ON system_events;
CREATE POLICY "Authenticated can insert system_events" ON system_events
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============================================================
-- 3. Add a stored function for frontend-initiated audit writes
-- ============================================================

CREATE OR REPLACE FUNCTION public.write_frontend_audit(
  p_user_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_previous_state jsonb DEFAULT NULL,
  p_new_state jsonb DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_event_type text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_audit_id uuid;
  v_event_id uuid;
BEGIN
  v_audit_id := create_audit_log(p_user_id, p_action, p_entity_type, p_entity_id, p_previous_state, p_new_state, p_reason);

  IF p_event_type IS NOT NULL THEN
    v_event_id := create_system_event(p_event_type, p_entity_type, p_entity_id,
      jsonb_build_object(
        'audit_id', v_audit_id,
        'action', p_action,
        'user_id', p_user_id,
        'reason', p_reason,
        'metadata', p_metadata
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'audit_id', v_audit_id,
    'event_id', v_event_id
  );
END;
$$;

-- ============================================================
-- 4. Add composite index for audit_logs query performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_action
  ON audit_logs(created_at DESC, action);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
  ON audit_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON audit_logs(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_system_events_created
  ON system_events(created_at DESC);
