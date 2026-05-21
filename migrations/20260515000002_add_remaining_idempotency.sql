-- ============================================================
-- MIGRATION: Add idempotency to remaining unprotected RPCs
-- ============================================================
-- record_stock_movement, reserve_inventory, and release_inventory
-- are still unprotected. This migration adds idempotency_key
-- parameters and ledger checks to all three.
-- ============================================================

-- ============================================================
-- 1. Update record_stock_movement
-- ============================================================
CREATE OR REPLACE FUNCTION record_stock_movement(
  p_product_id uuid,
  p_movement_type stock_movement_type,
  p_quantity decimal(10,3),
  p_unit text,
  p_created_by uuid,
  p_reference_type text DEFAULT NULL,
  p_reference_id text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_balance decimal(10,3);
  v_product products;
  v_sign integer;
  v_movement_id uuid;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'record_stock_movement')) IS NOT NULL THEN
      SELECT id INTO v_movement_id FROM stock_movements
      WHERE reference_type = COALESCE(p_reference_type, '')
        AND reference_id = COALESCE(p_reference_id, '')
        AND movement_type = p_movement_type
      ORDER BY created_at DESC LIMIT 1;
      RETURN jsonb_build_object('status', 'already_recorded', 'movement_id', v_movement_id);
    END IF;
  END IF;

  SELECT * INTO v_product FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'product_not_found'); END IF;

  v_sign := CASE WHEN p_movement_type IN ('purchase', 'adjustment') THEN 1 ELSE -1 END;

  SELECT running_balance INTO v_balance FROM stock_movements
  WHERE product_id = p_product_id ORDER BY created_at DESC LIMIT 1;
  v_balance := COALESCE(v_balance, 0) + (v_sign * p_quantity);

  IF v_sign < 0 AND v_balance < 0 THEN
    RETURN jsonb_build_object('error', 'insufficient_stock',
      'product_id', p_product_id, 'current_balance', v_balance + p_quantity, 'attempted_deduction', p_quantity);
  END IF;

  INSERT INTO stock_movements (product_id, movement_type, quantity, unit, running_balance, reference_type, reference_id, reason, created_by)
  VALUES (p_product_id, p_movement_type, p_quantity, p_unit, v_balance, p_reference_type, p_reference_id, p_reason, p_created_by)
  RETURNING id INTO v_movement_id;

  -- Mark idempotency
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'record_stock_movement',
      jsonb_build_object('movement_id', v_movement_id, 'running_balance', v_balance));
  END IF;

  PERFORM write_audit_log(p_created_by, 'stock_movement', 'product', p_product_id::text,
    jsonb_build_object('movement_type', p_movement_type, 'quantity', p_quantity),
    jsonb_build_object('running_balance', v_balance), p_reason);

  IF v_product.reorder_level IS NOT NULL AND v_balance <= v_product.reorder_level THEN
    INSERT INTO system_events (event_type, entity_type, entity_id, payload)
    VALUES ('STOCK_LOW', 'product', p_product_id::text,
      jsonb_build_object('product_name', v_product.name, 'balance', v_balance, 'reorder_level', v_product.reorder_level));
    PERFORM pg_notify('notifications', jsonb_build_object('event', 'low_stock', 'product_id', p_product_id, 'product_name', v_product.name)::text);
  END IF;

  RETURN jsonb_build_object('running_balance', v_balance, 'movement_id', v_movement_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. Update reserve_inventory
-- ============================================================
CREATE OR REPLACE FUNCTION reserve_inventory(
  p_order_id uuid,
  p_user_id uuid,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_item record;
  v_recipe_version_id uuid;
  v_recipe_item record;
  v_balance decimal(10,3);
  v_holds_created integer := 0;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'reserve_inventory')) IS NOT NULL THEN
      SELECT COUNT(*) INTO v_holds_created FROM inventory_holds
      WHERE order_id = p_order_id AND status = 'active';
      RETURN jsonb_build_object('status', 'already_reserved', 'holds_created', v_holds_created);
    END IF;
  END IF;

  -- Verify order exists and is pending
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND status = 'pending') THEN
    RETURN jsonb_build_object('error', 'order_not_pending');
  END IF;

  -- Remove any existing active holds for this order (re-reserve)
  UPDATE inventory_holds SET status = 'released'
  WHERE order_id = p_order_id AND status = 'active';

  -- For each order item with a recipe, create a hold
  FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
    SELECT rv.id INTO v_recipe_version_id
    FROM recipe_versions rv
    JOIN recipes r ON r.id = rv.recipe_id
    WHERE r.menu_item_id = v_item.menu_item_id AND rv.is_current = true
    LIMIT 1;

    IF v_recipe_version_id IS NOT NULL THEN
      FOR v_recipe_item IN SELECT * FROM recipe_items WHERE recipe_version_id = v_recipe_version_id LOOP
        IF v_recipe_item.product_id IS NOT NULL THEN
          INSERT INTO inventory_holds (order_id, product_id, quantity)
          VALUES (p_order_id, v_recipe_item.product_id, v_recipe_item.quantity * v_item.quantity);
          v_holds_created := v_holds_created + 1;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  -- Mark idempotency
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'reserve_inventory',
      jsonb_build_object('order_id', p_order_id, 'holds_created', v_holds_created));
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'holds_created', v_holds_created);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Update release_inventory
-- ============================================================
CREATE OR REPLACE FUNCTION release_inventory(
  p_order_id uuid,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_released integer;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'release_inventory')) IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'already_released');
    END IF;
  END IF;

  WITH updated AS (
    UPDATE inventory_holds SET status = 'released'
    WHERE order_id = p_order_id AND status = 'active'
    RETURNING id
  )
  SELECT count(*) INTO v_released FROM updated;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'release_inventory',
      jsonb_build_object('order_id', p_order_id, 'released', v_released));
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'released', v_released);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
