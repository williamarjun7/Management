-- ============================================================
-- MIGRATION: Add idempotency enforcement to missing RPCs
-- ============================================================
-- Adds idempotency_key parameters and checks to RPCs that were
-- missing them. Also adds idempotency_key column to room_services.
-- Applies after the main schema from docs/database/schema.sql.
-- ============================================================

-- 1. Add idempotency_key to room_services
ALTER TABLE room_services ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_room_services_idempotency ON room_services(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- 2. Update confirm_payment to accept idempotency_key
-- ============================================================
CREATE OR REPLACE FUNCTION confirm_payment(
  p_intent_id uuid,
  p_processed_by uuid,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_intent payment_intents;
  v_invoice invoices;
  v_total_paid decimal(10,2);
  v_new_status invoice_status;
  v_payment_log_id uuid;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'confirm_payment')) IS NOT NULL THEN
      SELECT id INTO v_payment_log_id FROM payment_logs WHERE idempotency_key = p_idempotency_key;
      RETURN jsonb_build_object('status', 'already_confirmed', 'intent_id', p_intent_id, 'payment_log_id', v_payment_log_id);
    END IF;
  END IF;

  -- Lock and validate intent
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'intent_not_found'); END IF;
  IF v_intent.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'invalid_status', 'current', v_intent.status);
  END IF;

  -- Mark as processing
  UPDATE payment_intents SET status = 'processing' WHERE id = p_intent_id;

  -- Lock invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = v_intent.invoice_id FOR UPDATE;
  IF v_invoice.status = 'paid' THEN
    UPDATE payment_intents SET status = 'failed', failed_reason = 'invoice_already_paid', failed_at = now()
    WHERE id = p_intent_id;
    RETURN jsonb_build_object('error', 'already_paid');
  END IF;

  -- Insert payment log
  INSERT INTO payment_logs (invoice_id, amount, method, status, processed_by, idempotency_key)
  VALUES (v_intent.invoice_id, v_intent.amount, v_intent.method, 'paid', p_processed_by, COALESCE(p_idempotency_key, v_intent.idempotency_key))
  RETURNING id INTO v_payment_log_id;

  -- Derive invoice status
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payment_logs WHERE invoice_id = v_intent.invoice_id AND status = 'paid';

  IF v_total_paid >= v_invoice.total THEN v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN v_new_status := 'partial';
  ELSE v_new_status := 'unpaid';
  END IF;

  UPDATE invoices SET status = v_new_status, updated_at = now() WHERE id = v_intent.invoice_id;
  UPDATE payment_intents SET status = 'succeeded', processed_at = now() WHERE id = p_intent_id;

  -- Mark idempotency
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'confirm_payment',
      jsonb_build_object('intent_id', p_intent_id, 'payment_log_id', v_payment_log_id));
  END IF;

  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES ('PAYMENT_RECEIVED', 'invoice', v_intent.invoice_id::text,
    jsonb_build_object('invoice_id', v_intent.invoice_id, 'intent_id', p_intent_id,
      'amount', v_intent.amount, 'method', v_intent.method,
      'remaining', GREATEST(v_invoice.total - v_total_paid, 0)));

  PERFORM pg_notify('notifications', jsonb_build_object('event', 'payment_received',
    'invoice_id', v_intent.invoice_id, 'amount', v_intent.amount)::text);

  RETURN jsonb_build_object('status', 'succeeded', 'intent_id', p_intent_id,
    'invoice_status', v_new_status, 'amount', v_intent.amount,
    'total_paid', v_total_paid, 'payment_log_id', v_payment_log_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. Update reverse_payment to accept idempotency_key
-- ============================================================
CREATE OR REPLACE FUNCTION reverse_payment(
  p_intent_id uuid,
  p_reversed_by uuid,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_intent payment_intents;
  v_invoice invoices;
  v_total_paid decimal(10,2);
  v_new_status invoice_status;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'reverse_payment')) IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'already_reversed', 'intent_id', p_intent_id);
    END IF;
  END IF;

  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'intent_not_found'); END IF;
  IF v_intent.status != 'succeeded' THEN
    RETURN jsonb_build_object('error', 'invalid_status', 'current', v_intent.status);
  END IF;

  SELECT * INTO v_invoice FROM invoices WHERE id = v_intent.invoice_id FOR UPDATE;

  UPDATE payment_logs SET status = 'refunded'
  WHERE idempotency_key = v_intent.idempotency_key;

  UPDATE payment_intents SET status = 'reversed', reversed_at = now(), reversed_reason = p_reason
  WHERE id = p_intent_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payment_logs WHERE invoice_id = v_intent.invoice_id AND status = 'paid';

  IF v_total_paid >= v_invoice.total THEN v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN v_new_status := 'partial';
  ELSE v_new_status := 'unpaid';
  END IF;

  UPDATE invoices SET status = v_new_status, updated_at = now() WHERE id = v_intent.invoice_id;

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'reverse_payment',
      jsonb_build_object('intent_id', p_intent_id));
  END IF;

  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES ('PAYMENT_REVERSED', 'invoice', v_intent.invoice_id::text,
    jsonb_build_object('invoice_id', v_intent.invoice_id, 'intent_id', p_intent_id,
      'amount', v_intent.amount, 'reason', p_reason));

  RETURN jsonb_build_object('status', 'reversed', 'intent_id', p_intent_id,
    'invoice_status', v_new_status, 'amount', v_intent.amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. Update create_booking to accept and check idempotency_key
-- ============================================================
CREATE OR REPLACE FUNCTION create_booking(
  p_room_id uuid,
  p_guest_name text,
  p_guest_phone text DEFAULT NULL,
  p_guest_email text DEFAULT NULL,
  p_guest_id_proof text DEFAULT NULL,
  p_check_in timestamptz,
  p_check_out timestamptz,
  p_adults integer DEFAULT 1,
  p_children integer DEFAULT 0,
  p_nightly_rate decimal(10,2),
  p_total_amount decimal(10,2),
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_room rooms;
  v_booking_id uuid;
  v_booking_number text;
  v_existing_id uuid;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM bookings WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'already_created', 'booking_id', v_existing_id);
    END IF;
  END IF;

  SELECT * INTO v_room FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'room_not_found'); END IF;
  IF v_room.status NOT IN ('available', 'reserved') THEN
    RETURN jsonb_build_object('error', 'room_not_available', 'status', v_room.status);
  END IF;

  v_booking_number := generate_booking_number();

  INSERT INTO bookings (
    room_id, guest_name, guest_phone, guest_email, guest_id_proof,
    check_in, check_out, adults, children, status,
    nightly_rate, total_amount, notes, created_by, booking_number, idempotency_key
  ) VALUES (
    p_room_id, p_guest_name, p_guest_phone, p_guest_email, p_guest_id_proof,
    p_check_in, p_check_out, p_adults, p_children, 'confirmed',
    p_nightly_rate, p_total_amount, p_notes, p_created_by, v_booking_number, p_idempotency_key
  ) RETURNING id INTO v_booking_id;

  IF v_room.status = 'available' THEN
    INSERT INTO room_state_transitions (room_id, from_status, to_status, reason, changed_by)
    VALUES (v_room.id, v_room.status, 'reserved', 'booking_created', p_created_by);
    UPDATE rooms SET status = 'reserved', updated_at = now() WHERE id = v_room.id;
  END IF;

  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES ('BOOKING_CREATED', 'booking', v_booking_id::text,
    jsonb_build_object('booking_id', v_booking_id, 'room_id', p_room_id));

  PERFORM write_audit_log(p_created_by, 'create_booking', 'booking', v_booking_id::text,
    NULL, jsonb_build_object('room_id', p_room_id, 'guest_name', p_guest_name));

  PERFORM pg_notify('room:' || p_room_id, jsonb_build_object('event', 'booking_created', 'booking_id', v_booking_id)::text);

  RETURN jsonb_build_object('status', 'created', 'booking_id', v_booking_id, 'booking_number', v_booking_number);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. Update create_room_service to accept and check idempotency_key
-- ============================================================
CREATE OR REPLACE FUNCTION create_room_service(
  p_booking_id uuid,
  p_room_id uuid,
  p_description text,
  p_quantity integer DEFAULT 1,
  p_unit_price decimal(10,2),
  p_total decimal(10,2) DEFAULT NULL,
  p_service_type text DEFAULT 'room_service',
  p_menu_item_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_service_id uuid;
  v_computed_total decimal(10,2);
  v_existing_id uuid;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM room_services WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'already_created', 'service_id', v_existing_id);
    END IF;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM bookings WHERE id = p_booking_id) THEN
    RETURN jsonb_build_object('error', 'booking_not_found');
  END IF;

  v_computed_total := COALESCE(p_total, p_quantity * p_unit_price);

  INSERT INTO room_services (booking_id, room_id, description, quantity, unit_price, total, service_type, menu_item_id, idempotency_key)
  VALUES (p_booking_id, p_room_id, p_description, p_quantity, p_unit_price, v_computed_total, p_service_type, p_menu_item_id, p_idempotency_key)
  RETURNING id INTO v_service_id;

  PERFORM pg_notify('room:' || p_room_id, jsonb_build_object('event', 'room_service_added', 'service_id', v_service_id)::text);

  RETURN jsonb_build_object('status', 'created', 'service_id', v_service_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. Update update_room_status to accept and check idempotency_key
-- ============================================================
CREATE OR REPLACE FUNCTION update_room_status(
  p_room_id uuid,
  p_new_status room_status,
  p_changed_by uuid DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_room rooms;
  v_old_status room_status;
BEGIN
  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    IF (SELECT check_idempotency_strict(p_idempotency_key, 'update_room_status')) IS NOT NULL THEN
      RETURN jsonb_build_object('status', 'already_updated', 'room_id', p_room_id);
    END IF;
  END IF;

  SELECT * INTO v_room FROM rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'room_not_found'); END IF;

  v_old_status := v_room.status;

  INSERT INTO room_state_transitions (room_id, from_status, to_status, reason, changed_by)
  VALUES (v_room.id, v_old_status, p_new_status, p_reason, p_changed_by);

  UPDATE rooms SET status = p_new_status, updated_at = now() WHERE id = v_room.id;

  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES ('ROOM_STATUS_CHANGED', 'room', p_room_id::text,
    jsonb_build_object('room_id', p_room_id, 'from_status', v_old_status, 'to_status', p_new_status));

  PERFORM write_audit_log(p_changed_by, 'update_room_status', 'room', p_room_id::text,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', p_new_status));

  PERFORM pg_notify('room:' || p_room_id, jsonb_build_object('event', 'status_change', 'from', v_old_status, 'to', p_new_status)::text);

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM mark_idempotency(p_idempotency_key, 'update_room_status',
      jsonb_build_object('room_id', p_room_id, 'from', v_old_status, 'to', p_new_status));
  END IF;

  RETURN jsonb_build_object('status', 'updated', 'room_id', p_room_id, 'from', v_old_status, 'to', p_new_status);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
