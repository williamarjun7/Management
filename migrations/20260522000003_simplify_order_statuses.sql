-- ============================================================
-- MIGRATION: Simplify order_status to active/completed/cancelled
-- ============================================================
-- Collapses pending→confirmed→preparing→ready→served into a
-- single 'active' state. Only active/completed/cancelled/refunded remain.
-- ============================================================

-- 1. Create new enum type
DO $$ BEGIN
  CREATE TYPE order_status_new AS ENUM ('active', 'completed', 'cancelled', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drop triggers that reference orders.status before altering the column type
DO $$ DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT tgname FROM pg_trigger WHERE tgrelid = 'orders'::regclass AND tgname NOT LIKE 'RI_%' LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON orders', rec.tgname);
  END LOOP;
END $$;

-- 2. Migrate orders.status
ALTER TABLE orders ALTER COLUMN status DROP DEFAULT;
ALTER TABLE orders
  ALTER COLUMN status TYPE order_status_new
  USING CASE status::text
    WHEN 'pending' THEN 'active'::order_status_new
    WHEN 'confirmed' THEN 'active'::order_status_new
    WHEN 'preparing' THEN 'active'::order_status_new
    WHEN 'ready' THEN 'active'::order_status_new
    WHEN 'served' THEN 'active'::order_status_new
    WHEN 'completed' THEN 'completed'::order_status_new
    WHEN 'cancelled' THEN 'cancelled'::order_status_new
    WHEN 'refunded' THEN 'refunded'::order_status_new
  END;

-- 3. Migrate order_items.status
ALTER TABLE order_items ALTER COLUMN status DROP DEFAULT;
ALTER TABLE order_items
  ALTER COLUMN status TYPE order_status_new
  USING CASE status::text
    WHEN 'pending' THEN 'active'::order_status_new
    WHEN 'confirmed' THEN 'active'::order_status_new
    WHEN 'preparing' THEN 'active'::order_status_new
    WHEN 'ready' THEN 'active'::order_status_new
    WHEN 'served' THEN 'active'::order_status_new
    WHEN 'completed' THEN 'completed'::order_status_new
    WHEN 'cancelled' THEN 'cancelled'::order_status_new
    WHEN 'refunded' THEN 'refunded'::order_status_new
  END;

-- 4. Migrate order_status_history.from_status
ALTER TABLE order_status_history
  ALTER COLUMN from_status TYPE order_status_new
  USING CASE WHEN from_status IS NULL THEN NULL
    ELSE CASE from_status::text
      WHEN 'pending' THEN 'active'::order_status_new
      WHEN 'confirmed' THEN 'active'::order_status_new
      WHEN 'preparing' THEN 'active'::order_status_new
      WHEN 'ready' THEN 'active'::order_status_new
      WHEN 'served' THEN 'active'::order_status_new
      WHEN 'completed' THEN 'completed'::order_status_new
      WHEN 'cancelled' THEN 'cancelled'::order_status_new
      WHEN 'refunded' THEN 'refunded'::order_status_new
    END
  END;

-- 5. Migrate order_status_history.to_status
ALTER TABLE order_status_history
  ALTER COLUMN to_status TYPE order_status_new
  USING CASE to_status::text
    WHEN 'pending' THEN 'active'::order_status_new
    WHEN 'confirmed' THEN 'active'::order_status_new
    WHEN 'preparing' THEN 'active'::order_status_new
    WHEN 'ready' THEN 'active'::order_status_new
    WHEN 'served' THEN 'active'::order_status_new
    WHEN 'completed' THEN 'completed'::order_status_new
    WHEN 'cancelled' THEN 'cancelled'::order_status_new
    WHEN 'refunded' THEN 'refunded'::order_status_new
  END;

-- 6. Drop old enum and rename new one
DROP TYPE order_status;
ALTER TYPE order_status_new RENAME TO order_status;

-- Restore defaults
ALTER TABLE orders ALTER COLUMN status SET DEFAULT 'active'::order_status;
ALTER TABLE order_items ALTER COLUMN status SET DEFAULT 'active'::order_status;

-- 7. Update trigger: fire ORDER_CONFIRMED on transition to active, ORDER_COMPLETED on completed, ORDER_CANCELLED on cancelled
CREATE OR REPLACE FUNCTION trigger_system_event_order()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
AS $$
BEGIN
  IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
    PERFORM public.create_system_event('ORDER_CONFIRMED', 'order', NEW.id::text,
      jsonb_build_object('order_id', NEW.id, 'total', NEW.total));
  END IF;
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    PERFORM public.create_system_event('ORDER_COMPLETED', 'order', NEW.id::text,
      jsonb_build_object('order_id', NEW.id, 'total', NEW.total));
  END IF;
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    PERFORM public.create_system_event('ORDER_CANCELLED', 'order', NEW.id::text,
      jsonb_build_object('order_id', NEW.id, 'total', NEW.total));
  END IF;
  RETURN NEW;
END;
$$;

-- 8. Update transition_order_status with simplified statuses
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

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'transition_order_status',
      jsonb_build_object('order_id', p_order_id, 'from', v_order.status, 'to', p_new_status));
  END IF;

  PERFORM pg_notify('notifications', jsonb_build_object('event', 'order_status_changed',
    'order_id', p_order_id, 'from', v_order.status, 'to', p_new_status)::text);

  RETURN jsonb_build_object('success', true, 'order_id', p_order_id, 'from', v_order.status, 'to', p_new_status);
END;
$$;

-- 9. Update reserve_inventory: accept active orders instead of pending
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
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'reserve_inventory')) IS NOT NULL THEN
      SELECT COUNT(*) INTO v_holds_created FROM inventory_holds
      WHERE order_id = p_order_id AND status = 'active';
      RETURN jsonb_build_object('status', 'already_reserved', 'holds_created', v_holds_created);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND status = 'active') THEN
    RETURN jsonb_build_object('error', 'order_not_active');
  END IF;

  UPDATE inventory_holds SET status = 'released'
  WHERE order_id = p_order_id AND status = 'active';

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

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'reserve_inventory',
      jsonb_build_object('order_id', p_order_id, 'holds_created', v_holds_created));
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'holds_created', v_holds_created);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate triggers on orders table
DROP TRIGGER IF EXISTS trigger_audit_order_status ON orders;
CREATE TRIGGER trigger_audit_order_status
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_audit_order_status();

DROP TRIGGER IF EXISTS trigger_system_event_order ON orders;
CREATE TRIGGER trigger_system_event_order
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION trigger_system_event_order();
