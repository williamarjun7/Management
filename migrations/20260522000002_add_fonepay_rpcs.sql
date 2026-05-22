-- RPC: Log a new fonepay transaction (INSERT)
CREATE OR REPLACE FUNCTION log_fonepay_transaction(
  p_invoice_id uuid,
  p_transaction_id text,
  p_amount decimal
) RETURNS jsonb AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO fonepay_transactions (invoice_id, transaction_id, amount, status, qr_generated_at)
  VALUES (p_invoice_id, p_transaction_id, p_amount, 'pending', now())
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Update fonepay transaction status after verification
CREATE OR REPLACE FUNCTION update_fonepay_transaction(
  p_transaction_id text,
  p_status text,
  p_payment_log_id uuid DEFAULT NULL
) RETURNS jsonb AS $$
BEGIN
  UPDATE fonepay_transactions
  SET
    status = p_status,
    verified_at = CASE WHEN p_status IN ('paid', 'failed') THEN now() ELSE verified_at END,
    payment_log_id = COALESCE(p_payment_log_id, payment_log_id)
  WHERE transaction_id = p_transaction_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
