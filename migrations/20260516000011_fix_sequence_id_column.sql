-- ============================================================
-- MIGRATION: Remove all sequence_id references from system_events
-- ============================================================
-- Fixes:
--   1. Drop index referencing sequence_id
--   2. Recreate create_system_event function without sequence_id
--   3. Reload PostgREST schema cache
-- ============================================================

-- 1. Drop index referencing sequence_id
DROP INDEX IF EXISTS idx_system_events_type_sequence;

-- 2. Recreate create_system_event without sequence_id
CREATE OR REPLACE FUNCTION public.create_system_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, COALESCE(p_payload, '{}'::jsonb))
  RETURNING id INTO v_id;

  PERFORM pg_notify('system_events',
    jsonb_build_object(
      'id', v_id,
      'event_type', p_event_type,
      'entity_type', p_entity_type,
      'entity_id', p_entity_id,
      'payload', COALESCE(p_payload, '{}'::jsonb)
    )::text);

  RETURN v_id;
END;
$$;

-- 3. Reload PostgREST schema cache so stale columns aren't cached
NOTIFY pgrst, 'reload schema';
