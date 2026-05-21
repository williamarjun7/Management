CREATE OR REPLACE FUNCTION transition_order_status(
  p_order_id uuid,
  p_new_status text,
  p_user_id uuid,
  p_idempotency_key text
) RETURNS jsonb AS $$
DECLARE
  v_order orders;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'order_not_found');
  END IF;

  UPDATE orders SET status = p_new_status::order_status, updated_at = now() WHERE id = p_order_id;

  INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, reason)
  VALUES (p_order_id, v_order.status, p_new_status::order_status, p_user_id, 'Status changed to ' || p_new_status);

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'from', v_order.status, 'to', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
