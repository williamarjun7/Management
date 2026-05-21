-- ============================================================
-- MIGRATION: Operational Tables — housekeeping, maintenance,
--             suppliers, purchase orders
-- ============================================================
-- Sections:
--   A. Housekeeping tasks + RPCs
--   B. Maintenance tasks + RPCs
--   C. Suppliers
--   D. Purchase orders + items + RPC
--   E. RLS policies
--   F. Indexes + realtime
-- ============================================================

-- ============================================================
-- A. Housekeeping Tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS housekeeping_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE CASCADE,
  assigned_to uuid,
  task_type text DEFAULT 'cleaning'
    CHECK (task_type IN ('cleaning','deep_clean','turnover','inspection')),
  status text DEFAULT 'pending'
    CHECK (status IN ('pending','in_progress','completed','cancelled')),
  priority text DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  notes text,
  completed_at timestamptz,
  created_by uuid,
  idempotency_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION assign_housekeeping(
  p_room_id uuid,
  p_assigned_to uuid,
  p_task_type text DEFAULT 'cleaning',
  p_priority text DEFAULT 'normal',
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  INSERT INTO housekeeping_tasks (room_id, assigned_to, task_type, priority, notes, created_by)
  VALUES (p_room_id, p_assigned_to, p_task_type, p_priority, p_notes, p_created_by)
  RETURNING id INTO v_task_id;

  PERFORM update_room_status(p_room_id, 'cleaning', p_created_by,
    'Housekeeping assigned: ' || p_task_type);

  RETURN jsonb_build_object('success', true, 'task_id', v_task_id);
END;
$$;

CREATE OR REPLACE FUNCTION complete_housekeeping(
  p_task_id uuid,
  p_completed_by uuid,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_task housekeeping_tasks;
  v_room_id uuid;
BEGIN
  UPDATE housekeeping_tasks
  SET status = 'completed', completed_at = now(), updated_at = now()
  WHERE id = p_task_id AND status IN ('pending', 'in_progress')
  RETURNING * INTO v_task;

  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Task not found or already completed');
  END IF;

  v_room_id := v_task.room_id;

  IF EXISTS (SELECT 1 FROM rooms WHERE id = v_room_id AND status = 'cleaning') THEN
    PERFORM update_room_status(v_room_id, 'available', p_completed_by,
      'Housekeeping completed');
  END IF;

  RETURN jsonb_build_object('success', true, 'task_id', p_task_id, 'room_id', v_room_id);
END;
$$;

-- ============================================================
-- B. Maintenance Tasks
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  asset_type text DEFAULT 'room'
    CHECK (asset_type IN ('room','equipment','furniture','plumbing','electrical','hvac','other')),
  description text NOT NULL,
  status text DEFAULT 'reported'
    CHECK (status IN ('reported','in_progress','completed','cancelled')),
  priority text DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  reported_by uuid,
  assigned_to uuid,
  estimated_cost decimal(10,2),
  actual_cost decimal(10,2),
  notes text,
  completed_at timestamptz,
  idempotency_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION schedule_maintenance(
  p_room_id uuid DEFAULT NULL,
  p_asset_type text DEFAULT 'room',
  p_description text DEFAULT NULL,
  p_priority text DEFAULT 'normal',
  p_notes text DEFAULT NULL,
  p_reported_by uuid DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL,
  p_estimated_cost decimal(10,2) DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  INSERT INTO maintenance_tasks
    (room_id, asset_type, description, priority, notes, reported_by, assigned_to, estimated_cost)
  VALUES
    (p_room_id, p_asset_type, p_description, p_priority, p_notes,
     p_reported_by, p_assigned_to, p_estimated_cost)
  RETURNING id INTO v_task_id;

  IF p_room_id IS NOT NULL THEN
    PERFORM update_room_status(p_room_id, 'maintenance', p_reported_by,
      'Maintenance: ' || p_description);
  END IF;

  RETURN jsonb_build_object('success', true, 'task_id', v_task_id);
END;
$$;

CREATE OR REPLACE FUNCTION complete_maintenance(
  p_task_id uuid,
  p_actual_cost decimal(10,2) DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_completed_by uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_task maintenance_tasks;
  v_room_id uuid;
BEGIN
  UPDATE maintenance_tasks
  SET status = 'completed',
      actual_cost = COALESCE(p_actual_cost, actual_cost),
      notes = CASE WHEN p_notes IS NOT NULL
                THEN COALESCE(notes, '') || E'\n' || p_notes
                ELSE notes END,
      completed_at = now(),
      updated_at = now()
  WHERE id = p_task_id AND status IN ('reported', 'in_progress')
  RETURNING * INTO v_task;

  IF v_task.id IS NULL THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Task not found or already completed');
  END IF;

  v_room_id := v_task.room_id;

  IF v_room_id IS NOT NULL AND
     EXISTS (SELECT 1 FROM rooms WHERE id = v_room_id AND status = 'maintenance')
  THEN
    PERFORM update_room_status(v_room_id, 'available', p_completed_by,
      'Maintenance completed');
  END IF;

  RETURN jsonb_build_object('success', true, 'task_id', p_task_id, 'room_id', v_room_id);
END;
$$;

-- ============================================================
-- C. Suppliers
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_person text,
  phone text,
  email text,
  address text,
  tax_id text,
  payment_terms text,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- D. Purchase Orders + Items
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL,
  supplier_id uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  status text DEFAULT 'draft'
    CHECK (status IN ('draft','ordered','partial','received','cancelled')),
  order_date timestamptz DEFAULT now(),
  expected_date timestamptz,
  received_date timestamptz,
  notes text,
  created_by uuid,
  idempotency_key text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity decimal(10,3) NOT NULL,
  unit text NOT NULL,
  unit_price decimal(10,2) NOT NULL,
  total_price decimal(12,2) NOT NULL,
  received_quantity decimal(10,3) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION receive_purchase_order(
  p_po_id uuid,
  p_received_by uuid,
  p_items jsonb DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_item record;
  v_product_id uuid;
  v_receive_qty decimal(10,3);
  v_unit text;
  v_po_status text;
  v_total_items int;
  v_received_items int;
BEGIN
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN
      SELECT (elem->>'id')::uuid AS item_id,
             (elem->>'quantity')::decimal(10,3) AS qty
      FROM jsonb_array_elements(p_items) AS elem
    LOOP
      UPDATE purchase_order_items
      SET received_quantity = received_quantity + v_item.qty
      WHERE id = v_item.item_id AND purchase_order_id = p_po_id
      RETURNING product_id, unit INTO v_product_id, v_unit;

      IF v_product_id IS NOT NULL THEN
        PERFORM record_stock_movement(
          v_product_id, 'purchase', v_item.qty, v_unit,
          p_received_by, 'purchase_order', p_po_id::text,
          'Received from PO'
        );
      END IF;
    END LOOP;
  ELSE
    FOR v_item IN
      SELECT poi.id, poi.product_id, poi.quantity, poi.unit,
             poi.received_quantity
      FROM purchase_order_items poi
      WHERE poi.purchase_order_id = p_po_id
    LOOP
      v_receive_qty := v_item.quantity - COALESCE(v_item.received_quantity, 0);
      IF v_receive_qty > 0 THEN
        UPDATE purchase_order_items
        SET received_quantity = v_item.quantity
        WHERE id = v_item.id;

        IF v_item.product_id IS NOT NULL THEN
          PERFORM record_stock_movement(
            v_item.product_id, 'purchase', v_receive_qty, v_item.unit,
            p_received_by, 'purchase_order', p_po_id::text,
            'Received from PO (full)'
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE received_quantity >= quantity)
  INTO v_total_items, v_received_items
  FROM purchase_order_items
  WHERE purchase_order_id = p_po_id;

  v_po_status := CASE WHEN v_received_items >= v_total_items THEN 'received'
                      WHEN v_received_items > 0 THEN 'partial'
                      ELSE 'ordered' END;

  UPDATE purchase_orders
  SET status = v_po_status,
      received_date = CASE WHEN v_po_status = 'received' THEN now() ELSE received_date END,
      updated_at = now()
  WHERE id = p_po_id;

  RETURN jsonb_build_object(
    'success', true, 'po_id', p_po_id,
    'new_status', v_po_status,
    'total_items', v_total_items,
    'received_items', v_received_items
  );
END;
$$;

-- ============================================================
-- E. RLS Policies
-- ============================================================
ALTER TABLE IF EXISTS housekeeping_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS purchase_order_items ENABLE ROW LEVEL SECURITY;

-- Admin full access on all new tables
CREATE POLICY "admin_full_access" ON housekeeping_tasks
  FOR ALL USING (is_project_admin());
CREATE POLICY "admin_full_access" ON maintenance_tasks
  FOR ALL USING (is_project_admin());
CREATE POLICY "admin_full_access" ON suppliers
  FOR ALL USING (is_project_admin());
CREATE POLICY "admin_full_access" ON purchase_orders
  FOR ALL USING (is_project_admin());
CREATE POLICY "admin_full_access" ON purchase_order_items
  FOR ALL USING (is_project_admin());

-- Authenticated CRUD
CREATE POLICY "authenticated_all" ON housekeeping_tasks
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);
CREATE POLICY "authenticated_all" ON maintenance_tasks
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);
CREATE POLICY "authenticated_all" ON suppliers
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);
CREATE POLICY "authenticated_all" ON purchase_orders
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);
CREATE POLICY "authenticated_all" ON purchase_order_items
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- ============================================================
-- F. Indexes + realtime publication
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_room_id ON housekeeping_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_status ON housekeeping_tasks(status);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_assigned_to ON housekeeping_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_housekeeping_tasks_created_at ON housekeeping_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_room_id ON maintenance_tasks(room_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_status ON maintenance_tasks(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_assigned_to ON maintenance_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_created_at ON maintenance_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON suppliers(name);
CREATE INDEX IF NOT EXISTS idx_suppliers_is_active ON suppliers(is_active);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier_id ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_po_id ON purchase_order_items(purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_product_id ON purchase_order_items(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS housekeeping_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS maintenance_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS purchase_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS purchase_order_items;

NOTIFY pgrst, 'reload schema';
