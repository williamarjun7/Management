-- ============================================================
-- MIGRATION: Add p_idempotency_key to transition_order_status
-- ============================================================
-- The original 20260521000002 migration defined the function
-- without the p_idempotency_key parameter that the frontend
-- sends. This caused PostgREST schema cache errors.
-- ============================================================

CREATE OR REPLACE FUNCTION transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_user_id uuid,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
AS $$
DECLARE
  v_order public.orders;
  v_cached jsonb;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := check_idempotency_strict(p_idempotency_key, 'transition_order_status');
    IF v_cached IS NOT NULL THEN
      RETURN jsonb_build_object('success', true, 'order_id', p_order_id);
    END IF;
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'order_not_found');
  END IF;

  UPDATE public.orders SET status = p_new_status::order_status, updated_at = now() WHERE id = p_order_id;

  INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status, p_new_status::order_status, p_user_id, 'Status changed to ' || p_new_status);

  -- Mark idempotency
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'transition_order_status',
      jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', p_new_status));
  END IF;

  PERFORM pg_notify('notifications', jsonb_build_object('event', 'order_status_changed',
    'order_id', p_order_id, 'from', v_order.status, 'to', p_new_status)::text);

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'from', v_order.status, 'to', p_new_status);
END;
$$;
