-- ============================================================
-- MIGRATION: Split Bill System — tables, RPCs, RLS, indexes
-- ============================================================
-- Sections:
--   A. bill_splits table
--   B. split_items table
--   C. split_payments table
--   D. RPC: create_split_bill
--   E. RPC: finalize_split
--   F. RPC: refund_split
--   G. RPC: add_split_payment
--   H. RPC: get_splits_for_invoice
--   I. RLS policies
--   J. Indexes + realtime
-- ============================================================

-- ============================================================
-- A. bill_splits
-- ============================================================
CREATE TABLE IF NOT EXISTS bill_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  split_type text NOT NULL DEFAULT 'equal'
    CHECK (split_type IN ('equal', 'item_based', 'custom')),
  guest_name text NOT NULL DEFAULT 'Guest',
  subtotal decimal(10,2) NOT NULL DEFAULT 0,
  tax_amount decimal(10,2) NOT NULL DEFAULT 0,
  service_charge decimal(10,2) NOT NULL DEFAULT 0,
  discount_amount decimal(10,2) NOT NULL DEFAULT 0,
  total_amount decimal(10,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','partially_paid','paid','refunded')),
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================================
-- B. split_items
-- ============================================================
CREATE TABLE IF NOT EXISTS split_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id uuid NOT NULL REFERENCES bill_splits(id) ON DELETE CASCADE,
  order_item_id uuid REFERENCES order_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  quantity int NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price decimal(10,2) NOT NULL DEFAULT 0,
  total_price decimal(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- C. split_payments
-- ============================================================
CREATE TABLE IF NOT EXISTS split_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  split_id uuid NOT NULL REFERENCES bill_splits(id) ON DELETE CASCADE,
  payment_method text NOT NULL DEFAULT 'cash'
    CHECK (payment_method IN ('cash','card','upi','credit_account','digital_wallet','mixed')),
  amount decimal(10,2) NOT NULL CHECK (amount > 0),
  transaction_reference text,
  notes text,
  processed_by uuid,
  idempotency_key text,
  paid_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- ============================================================
-- D. RPC: create_split_bill
-- Creates splits for an invoice, supporting equal/item_based/custom
-- ============================================================
CREATE OR REPLACE FUNCTION create_split_bill(
  p_invoice_id uuid,
  p_order_id uuid DEFAULT NULL,
  p_split_type text DEFAULT 'equal',
  p_guests jsonb DEFAULT NULL,
  p_processed_by uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_invoice invoices;
  v_guest record;
  v_split_id uuid;
  v_split_ids uuid[] := '{}';
  v_result jsonb;
  v_item record;
  v_equal_share decimal(10,2);
  v_remainder decimal(10,2);
  v_guest_count int;
  v_subtotal decimal(10,2);
  v_tax decimal(10,2);
  v_service decimal(10,2);
  v_discount decimal(10,2);
  v_total decimal(10,2);
  v_tax_rate decimal(10,2);
BEGIN
  -- Lock and validate invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_invoice.status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice already paid');
  END IF;

  -- Validate guests array
  IF p_guests IS NULL OR jsonb_typeof(p_guests) != 'array' OR jsonb_array_length(p_guests) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'At least one guest required');
  END IF;

  -- Calculate tax rate from invoice (if subtotal > 0)
  v_tax_rate := CASE WHEN v_invoice.subtotal > 0
    THEN (v_invoice.total - v_invoice.subtotal + v_invoice.discount) / v_invoice.subtotal
    ELSE 0 END;

  v_guest_count := jsonb_array_length(p_guests);

  IF p_split_type = 'equal' THEN
    v_equal_share := FLOOR((v_invoice.total / v_guest_count) * 100) / 100;
    v_remainder := v_invoice.total - (v_equal_share * v_guest_count);

    FOR v_guest IN
      SELECT
        (elem->>'guest_name')::text AS guest_name,
        (elem->>'sort_order')::int AS sort_order,
        row_number() OVER () AS idx
      FROM jsonb_array_elements(p_guests) WITH ORDINALITY AS elem
    LOOP
      v_total := v_equal_share;
      -- Add remainder penny to last guest
      IF v_guest.idx = v_guest_count THEN
        v_total := v_total + v_remainder;
      END IF;

      v_subtotal := ROUND(v_total / (1 + COALESCE(v_tax_rate, 0)), 2);
      v_tax := v_total - v_subtotal;

      INSERT INTO bill_splits (
        invoice_id, order_id, split_type, guest_name,
        subtotal, tax_amount, service_charge, discount_amount,
        total_amount, payment_status, sort_order, created_by
      ) VALUES (
        p_invoice_id, p_order_id, p_split_type, v_guest.guest_name,
        v_subtotal, v_tax, 0, 0,
        v_total, 'unpaid', v_guest.sort_order, p_processed_by
      ) RETURNING id INTO v_split_id;

      v_split_ids := array_append(v_split_ids, v_split_id);
    END LOOP;
  END IF;

  -- Build result
  SELECT jsonb_agg(jsonb_build_object(
    'id', bs.id,
    'guest_name', bs.guest_name,
    'total_amount', bs.total_amount,
    'payment_status', bs.payment_status
  )) INTO v_result
  FROM bill_splits bs
  WHERE bs.id = ANY(v_split_ids)
  ORDER BY bs.sort_order;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'split_type', p_split_type,
    'split_count', array_length(v_split_ids, 1),
    'splits', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

-- ============================================================
-- E. RPC: finalize_split
-- Marks a split as finalized (ready for payment)
-- ============================================================
CREATE OR REPLACE FUNCTION finalize_split(
  p_split_id uuid,
  p_processed_by uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_split bill_splits;
BEGIN
  SELECT * INTO v_split FROM bill_splits WHERE id = p_split_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split not found');
  END IF;

  IF v_split.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split already paid');
  END IF;

  UPDATE bill_splits
  SET updated_at = now()
  WHERE id = p_split_id;

  RETURN jsonb_build_object('success', true, 'split_id', p_split_id);
END;
$$;

-- ============================================================
-- F. RPC: refund_split
-- Marks a split as refunded
-- ============================================================
CREATE OR REPLACE FUNCTION refund_split(
  p_split_id uuid,
  p_reason text DEFAULT NULL,
  p_processed_by uuid DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_split bill_splits;
BEGIN
  SELECT * INTO v_split FROM bill_splits WHERE id = p_split_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split not found');
  END IF;

  IF v_split.payment_status != 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only paid splits can be refunded');
  END IF;

  UPDATE bill_splits
  SET payment_status = 'refunded', updated_at = now()
  WHERE id = p_split_id;

  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES ('SPLIT_REFUNDED', 'bill_split', p_split_id::text,
    jsonb_build_object('reason', p_reason, 'amount', v_split.total_amount));

  RETURN jsonb_build_object('success', true, 'split_id', p_split_id, 'amount', v_split.total_amount);
END;
$$;

-- ============================================================
-- G. RPC: add_split_payment
-- Records a payment against a split
-- ============================================================
CREATE OR REPLACE FUNCTION add_split_payment(
  p_split_id uuid,
  p_amount decimal(10,2),
  p_payment_method text DEFAULT 'cash',
  p_transaction_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_processed_by uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_split bill_splits;
  v_total_paid decimal(10,2);
  v_new_status text;
  v_payment_id uuid;
BEGIN
  SELECT * INTO v_split FROM bill_splits WHERE id = p_split_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split not found');
  END IF;

  IF v_split.payment_status = 'paid' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split already fully paid');
  END IF;

  IF v_split.payment_status = 'refunded' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Split has been refunded');
  END IF;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Amount must be positive');
  END IF;

  -- Calculate total already paid
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM split_payments WHERE split_id = p_split_id;

  IF (v_total_paid + p_amount) > v_split.total_amount THEN
    RETURN jsonb_build_object('success', false, 'error', 'Payment exceeds split total',
      'split_total', v_split.total_amount, 'already_paid', v_total_paid, 'attempted', p_amount);
  END IF;

  -- Insert the payment
  INSERT INTO split_payments (split_id, payment_method, amount, transaction_reference, notes, processed_by, idempotency_key)
  VALUES (p_split_id, p_payment_method, p_amount, p_transaction_reference, p_notes, p_processed_by, p_idempotency_key)
  RETURNING id INTO v_payment_id;

  -- Recalculate status
  v_total_paid := v_total_paid + p_amount;
  IF v_total_paid >= v_split.total_amount THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partially_paid';
  ELSE
    v_new_status := 'unpaid';
  END IF;

  UPDATE bill_splits
  SET payment_status = v_new_status, updated_at = now()
  WHERE id = p_split_id;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'split_id', p_split_id,
    'amount', p_amount,
    'total_paid', v_total_paid,
    'payment_status', v_new_status,
    'remaining', GREATEST(v_split.total_amount - v_total_paid, 0)
  );
END;
$$;

-- ============================================================
-- H. RPC: get_splits_for_invoice
-- Returns all splits with items and payments for an invoice
-- ============================================================
CREATE OR REPLACE FUNCTION get_splits_for_invoice(
  p_invoice_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', bs.id,
      'invoice_id', bs.invoice_id,
      'order_id', bs.order_id,
      'split_type', bs.split_type,
      'guest_name', bs.guest_name,
      'subtotal', bs.subtotal,
      'tax_amount', bs.tax_amount,
      'service_charge', bs.service_charge,
      'discount_amount', bs.discount_amount,
      'total_amount', bs.total_amount,
      'payment_status', bs.payment_status,
      'sort_order', bs.sort_order,
      'created_by', bs.created_by,
      'created_at', bs.created_at,
      'updated_at', bs.updated_at,
      'split_items', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', si.id,
          'split_id', si.split_id,
          'order_item_id', si.order_item_id,
          'item_name', si.item_name,
          'quantity', si.quantity,
          'unit_price', si.unit_price,
          'total_price', si.total_price,
          'created_at', si.created_at
        ) ORDER BY si.created_at)
        FROM split_items si WHERE si.split_id = bs.id
      ), '[]'::jsonb),
      'split_payments', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', sp.id,
          'split_id', sp.split_id,
          'payment_method', sp.payment_method,
          'amount', sp.amount,
          'transaction_reference', sp.transaction_reference,
          'notes', sp.notes,
          'processed_by', sp.processed_by,
          'paid_at', sp.paid_at,
          'created_at', sp.created_at
        ) ORDER BY sp.paid_at)
        FROM split_payments sp WHERE sp.split_id = bs.id
      ), '[]'::jsonb)
    ) ORDER BY bs.sort_order
  ) INTO v_result
  FROM bill_splits bs
  WHERE bs.invoice_id = p_invoice_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', p_invoice_id,
    'splits', COALESCE(v_result, '[]'::jsonb)
  );
END;
$$;

-- ============================================================
-- I. RLS Policies
-- ============================================================
ALTER TABLE IF EXISTS bill_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS split_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS split_payments ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "admin_full_access" ON bill_splits
  FOR ALL USING (is_project_admin());
CREATE POLICY "admin_full_access" ON split_items
  FOR ALL USING (is_project_admin());
CREATE POLICY "admin_full_access" ON split_payments
  FOR ALL USING (is_project_admin());

-- Authenticated CRUD
CREATE POLICY "authenticated_all" ON bill_splits
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);
CREATE POLICY "authenticated_all" ON split_items
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);
CREATE POLICY "authenticated_all" ON split_payments
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- ============================================================
-- J. Indexes + realtime publication
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_bill_splits_invoice_id ON bill_splits(invoice_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_order_id ON bill_splits(order_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_payment_status ON bill_splits(payment_status);
CREATE INDEX IF NOT EXISTS idx_bill_splits_created_at ON bill_splits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_split_items_split_id ON split_items(split_id);
CREATE INDEX IF NOT EXISTS idx_split_items_order_item_id ON split_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_split_payments_split_id ON split_payments(split_id);
CREATE INDEX IF NOT EXISTS idx_split_payments_method ON split_payments(payment_method);
CREATE INDEX IF NOT EXISTS idx_split_payments_paid_at ON split_payments(paid_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS bill_splits;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS split_items;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS split_payments;

NOTIFY pgrst, 'reload schema';
