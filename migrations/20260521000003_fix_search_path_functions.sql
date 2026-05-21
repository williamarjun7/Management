-- ============================================================
-- MIGRATION: Fix functions with search_path="" that reference
-- tables/functions without schema qualification
-- ============================================================
-- The InsForge advisor fix (20260516000003, 20260516000010)
-- sets search_path = '' on many functions for security, but
-- this breaks unqualified table references inside function
-- bodies. This migration adds public. schema qualifiers to
-- all unqualified references inside those functions.
-- ============================================================

-- Fix trigger_audit_order_status
CREATE OR REPLACE FUNCTION trigger_audit_order_status()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by)
  VALUES (NEW.id, OLD.status, NEW.status, auth.uid());
  RETURN NEW;
END;
$$;

-- Fix trigger_system_event_order
CREATE OR REPLACE FUNCTION trigger_system_event_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    PERFORM public.create_system_event('ORDER_CONFIRMED', 'order', NEW.id::text,
      jsonb_build_object('order_id', NEW.id, 'total', NEW.total));
  END IF;
  RETURN NEW;
END;
$$;

-- Fix create_system_event (returns void)
CREATE OR REPLACE FUNCTION create_system_event(
  p_event_type text,
  p_entity_type text,
  p_entity_id text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  INSERT INTO public.system_events (event_type, entity_type, entity_id, payload)
  VALUES (p_event_type, p_entity_type, p_entity_id, p_payload);
END;
$$;