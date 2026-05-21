-- ============================================================
-- MIGRATION: Fix crash window in payment RPCs
-- ============================================================
-- Problem: mark_idempotency() runs AFTER the payment_log INSERT
-- and intent status change. If the server crashes between
-- the INSERT and the ledger write, retries find the intent
-- in 'processing' state and fail permanently.
--
-- Fix: Store the ledger entry immediately after locking the
-- intent (before any non-reversible mutation), then update
-- the cached result after successful processing.
-- ============================================================

-- Helper: update idempotency ledger result after processing completes
CREATE OR REPLACE FUNCTION update_idempotency_result(
  p_idempotency_key text,
  p_operation text,
  p_result jsonb
) RETURNS void AS $$
BEGIN
  UPDATE idempotency_keys SET result = p_result
  WHERE key_hash = encode(digest(p_idempotency_key, 'sha256'), 'hex')
    AND operation = p_operation;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Fixed confirm_payment: early ledger write + processing resume
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
  v_resuming boolean := false;
BEGIN
  -- Lock and validate intent (acquired early for both idempotency and processing)
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'intent_not_found'); END IF;

  -- Idempotency check: if ledger has a final result, return cached
  IF p_idempotency_key IS NOT NULL THEN
    DECLARE
      v_cached jsonb;
    BEGIN
      v_cached := check_idempotency_strict(p_idempotency_key, 'confirm_payment');
      IF v_cached IS NOT NULL AND v_cached->>'status' != 'processing' THEN
        RETURN v_cached;
      END IF;
      -- If cached shows 'processing', resume from where we left off
      IF v_cached IS NOT NULL AND v_cached->>'status' = 'processing' THEN
        v_resuming := true;
      END IF;
    END;
  END IF;

  -- Validate intent state: pending (fresh) or processing (resume after crash)
  IF NOT v_resuming AND v_intent.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'invalid_status', 'current', v_intent.status);
  END IF;
  IF v_resuming AND v_intent.status NOT IN ('processing', 'succeeded') THEN
    RETURN jsonb_build_object('error', 'invalid_status_for_resume', 'current', v_intent.status);
  END IF;

  -- If resuming an already-succeeded intent, just return the result
  IF v_resuming AND v_intent.status = 'succeeded' THEN
    SELECT id INTO v_payment_log_id FROM payment_logs
    WHERE idempotency_key = p_idempotency_key
    ORDER BY created_at DESC LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('status', 'succeeded', 'intent_id', p_intent_id,
        'payment_log_id', v_payment_log_id);
    END IF;
  END IF;

  -- EARLY ledger write: mark before any non-reversible changes
  -- This ensures retries find a cached entry and never re-process
  IF p_idempotency_key IS NOT NULL AND NOT v_resuming THEN
    PERFORM mark_idempotency(p_idempotency_key, 'confirm_payment',
      jsonb_build_object('status', 'processing', 'intent_id', p_intent_id));
  END IF;

  -- Mark as processing (safe to re-do if resuming)
  IF NOT v_resuming THEN
    UPDATE payment_intents SET status = 'processing' WHERE id = p_intent_id;
  END IF;

  -- Lock invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = v_intent.invoice_id FOR UPDATE;
  IF v_invoice.status = 'paid' THEN
    UPDATE payment_intents SET status = 'failed', failed_reason = 'invoice_already_paid', failed_at = now()
    WHERE id = p_intent_id;
    RETURN jsonb_build_object('error', 'already_paid');
  END IF;

  -- Check if payment_log already exists (first attempt succeeded up to the INSERT)
  IF v_resuming THEN
    SELECT id INTO v_payment_log_id FROM payment_logs
    WHERE idempotency_key = p_idempotency_key
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  -- Insert payment log if not already created
  IF v_payment_log_id IS NULL THEN
    INSERT INTO payment_logs (invoice_id, amount, method, status, processed_by, idempotency_key)
    VALUES (v_intent.invoice_id, v_intent.amount, v_intent.method, 'paid', p_processed_by,
      COALESCE(p_idempotency_key, v_intent.idempotency_key))
    RETURNING id INTO v_payment_log_id;
  END IF;

  -- Derive invoice status (recalculate from all paid logs — safe to re-do)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payment_logs WHERE invoice_id = v_intent.invoice_id AND status = 'paid';

  IF v_total_paid >= v_invoice.total THEN v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN v_new_status := 'partial';
  ELSE v_new_status := 'unpaid';
  END IF;

  UPDATE invoices SET status = v_new_status, updated_at = now() WHERE id = v_intent.invoice_id;
  UPDATE payment_intents SET status = 'succeeded', processed_at = now() WHERE id = p_intent_id;

  -- Update ledger with final result
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM update_idempotency_result(p_idempotency_key, 'confirm_payment',
      jsonb_build_object('status', 'succeeded', 'intent_id', p_intent_id,
        'payment_log_id', v_payment_log_id));
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
-- Also fix reverse_payment with early ledger write
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
  v_resuming boolean := false;
BEGIN
  -- Lock intent early
  SELECT * INTO v_intent FROM payment_intents WHERE id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'intent_not_found'); END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    DECLARE
      v_cached jsonb;
    BEGIN
      v_cached := check_idempotency_strict(p_idempotency_key, 'reverse_payment');
      IF v_cached IS NOT NULL AND v_cached->>'status' != 'processing' THEN
        RETURN v_cached;
      END IF;
      IF v_cached IS NOT NULL AND v_cached->>'status' = 'processing' THEN
        v_resuming := true;
      END IF;
    END;
  END IF;

  IF NOT v_resuming AND v_intent.status != 'succeeded' THEN
    RETURN jsonb_build_object('error', 'invalid_status', 'current', v_intent.status);
  END IF;
  IF v_resuming AND v_intent.status NOT IN ('reversed') THEN
    -- If resuming and not yet reversed, continue
    NULL;
  END IF;

  -- If already reversed, return cached
  IF v_resuming AND v_intent.status = 'reversed' THEN
    RETURN jsonb_build_object('status', 'already_reversed', 'intent_id', p_intent_id);
  END IF;

  -- EARLY ledger write
  IF p_idempotency_key IS NOT NULL AND NOT v_resuming THEN
    PERFORM mark_idempotency(p_idempotency_key, 'reverse_payment',
      jsonb_build_object('status', 'processing', 'intent_id', p_intent_id));
  END IF;

  -- Lock invoice
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

  -- Update ledger with final result
  IF p_idempotency_key IS NOT NULL THEN
    PERFORM update_idempotency_result(p_idempotency_key, 'reverse_payment',
      jsonb_build_object('status', 'reversed', 'intent_id', p_intent_id));
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
-- Fixed process_payment: early ledger write + crash-safe resume
-- ============================================================
CREATE OR REPLACE FUNCTION process_payment(
  p_invoice_id uuid,
  p_amount decimal(10,2),
  p_method payment_method,
  p_processed_by uuid,
  p_idempotency_key text,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_invoice invoices;
  v_total_paid decimal(10,2);
  v_remaining decimal(10,2);
  v_new_status invoice_status;
  v_resuming boolean := false;
BEGIN
  -- Lock invoice early
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'invoice_not_found'); END IF;

  -- Idempotency check with resume support
  DECLARE
    v_cached jsonb;
  BEGIN
    v_cached := check_idempotency_strict(p_idempotency_key, 'process_payment');
    IF v_cached IS NOT NULL AND v_cached->>'status' != 'processing' THEN
      RETURN v_cached;
    END IF;
    IF v_cached IS NOT NULL AND v_cached->>'status' = 'processing' THEN
      v_resuming := true;
    END IF;
  END;

  -- If resuming, check if payment_log was already created
  IF v_resuming THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM payment_logs WHERE invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
    IF v_total_paid > 0 THEN
      -- Payment was already recorded, recalculate status and return
      SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
      FROM payment_logs WHERE invoice_id = p_invoice_id AND status = 'paid';
      IF v_total_paid >= v_invoice.total THEN v_new_status := 'paid';
      ELSIF v_total_paid > 0 THEN v_new_status := 'partial';
      ELSE v_new_status := 'unpaid';
      END IF;
      PERFORM update_idempotency_result(p_idempotency_key, 'process_payment',
        jsonb_build_object('amount', p_amount, 'status', v_new_status, 'total_paid', v_total_paid));
      RETURN jsonb_build_object('status', v_new_status, 'amount', p_amount,
        'total_paid', v_total_paid, 'remaining', GREATEST(v_invoice.total - v_total_paid, 0));
    END IF;
  END IF;

  -- Validate invoice state
  IF v_invoice.status = 'paid' THEN
    RETURN jsonb_build_object('error', 'already_paid');
  END IF;

  -- Calculate remaining
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM payment_logs WHERE invoice_id = p_invoice_id AND status = 'paid';

  v_remaining := v_invoice.total - v_total_paid;

  IF p_amount <= 0 THEN
    RETURN jsonb_build_object('error', 'amount_must_be_positive');
  END IF;
  IF p_amount > v_remaining THEN
    RETURN jsonb_build_object('error', 'amount_exceeds_remaining',
      'remaining', v_remaining, 'attempted', p_amount);
  END IF;

  -- EARLY ledger write
  IF NOT v_resuming THEN
    PERFORM mark_idempotency(p_idempotency_key, 'process_payment',
      jsonb_build_object('status', 'processing', 'invoice_id', p_invoice_id));
  END IF;

  -- Insert payment (append-only)
  INSERT INTO payment_logs (invoice_id, amount, method, reference, status, notes, processed_by, idempotency_key)
  VALUES (p_invoice_id, p_amount, p_method, p_reference, 'paid', p_notes, p_processed_by, p_idempotency_key);

  -- Derive new status
  v_total_paid := v_total_paid + p_amount;
  IF v_total_paid >= v_invoice.total THEN v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN v_new_status := 'partial';
  ELSE v_new_status := 'unpaid';
  END IF;

  UPDATE invoices SET status = v_new_status, updated_at = now() WHERE id = p_invoice_id;

  -- Update ledger with final result
  PERFORM update_idempotency_result(p_idempotency_key, 'process_payment',
    jsonb_build_object('amount', p_amount, 'status', v_new_status, 'total_paid', v_total_paid));

  INSERT INTO system_events (event_type, entity_type, entity_id, payload)
  VALUES ('PAYMENT_RECEIVED', 'invoice', p_invoice_id::text,
    jsonb_build_object('invoice_id', p_invoice_id, 'amount', p_amount, 'method', p_method,
      'remaining', GREATEST(v_remaining - p_amount, 0)));

  RETURN jsonb_build_object('status', v_new_status, 'amount', p_amount,
    'total_paid', v_total_paid, 'remaining', GREATEST(v_remaining - p_amount, 0));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Fixed process_cash_payment: pass idempotency_key to confirm_payment
-- ============================================================
CREATE OR REPLACE FUNCTION process_cash_payment(
  p_invoice_id uuid,
  p_amount decimal(10,2),
  p_processed_by uuid,
  p_idempotency_key text,
  p_notes text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_intent_id uuid;
  v_result jsonb;
BEGIN
  -- Create payment intent (idempotent via its own early ledger write)
  v_result := create_payment_intent(p_invoice_id, p_amount, 'cash', p_processed_by, p_idempotency_key);
  IF v_result ? 'error' THEN RETURN v_result; END IF;

  v_intent_id := (v_result->>'intent_id')::uuid;

  -- Confirm payment with the SAME idempotency_key for crash-safe resumption
  v_result := confirm_payment(v_intent_id, p_processed_by, p_idempotency_key);

  -- Add notes
  IF p_notes IS NOT NULL AND NOT (v_result ? 'error') THEN
    UPDATE payment_logs SET notes = p_notes
    WHERE invoice_id = p_invoice_id AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
