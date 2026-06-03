-- Add missing fields to fonepay_transactions
ALTER TABLE fonepay_transactions ADD COLUMN IF NOT EXISTS qr_expiry timestamptz;
ALTER TABLE fonepay_transactions ADD COLUMN IF NOT EXISTS gateway_reference text;
ALTER TABLE fonepay_transactions ADD COLUMN IF NOT EXISTS paid_amount decimal(10,2);
ALTER TABLE fonepay_transactions ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_fonepay_tx_gateway_ref ON fonepay_transactions(gateway_reference);

-- Auto-set qr_expiry on insert via trigger
CREATE OR REPLACE FUNCTION set_fonepay_qr_expiry()
RETURNS TRIGGER AS $$
BEGIN
  NEW.qr_expiry := COALESCE(NEW.qr_expiry, now() + interval '10 minutes');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fonepay_qr_expiry ON fonepay_transactions;
CREATE TRIGGER trg_fonepay_qr_expiry
  BEFORE INSERT ON fonepay_transactions
  FOR EACH ROW
  EXECUTE FUNCTION set_fonepay_qr_expiry();

-- Enhanced log_fonepay_transaction with expiry
CREATE OR REPLACE FUNCTION log_fonepay_transaction(
  p_invoice_id uuid,
  p_transaction_id text,
  p_amount decimal,
  p_qr_expiry timestamptz DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO fonepay_transactions (invoice_id, transaction_id, amount, status, qr_generated_at, qr_expiry)
  VALUES (p_invoice_id, p_transaction_id, p_amount, 'pending', now(), p_qr_expiry)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enhanced update_fonepay_transaction with paid_amount and gateway_reference
CREATE OR REPLACE FUNCTION update_fonepay_transaction(
  p_transaction_id text,
  p_status text,
  p_payment_log_id uuid DEFAULT NULL,
  p_gateway_reference text DEFAULT NULL,
  p_paid_amount decimal DEFAULT NULL
) RETURNS jsonb AS $$
BEGIN
  UPDATE fonepay_transactions
  SET
    status = p_status,
    verified_at = CASE WHEN p_status IN ('paid', 'failed') THEN now() ELSE verified_at END,
    payment_log_id = COALESCE(p_payment_log_id, payment_log_id),
    gateway_reference = COALESCE(p_gateway_reference, gateway_reference),
    paid_amount = COALESCE(p_paid_amount, paid_amount),
    paid_at = CASE WHEN p_status = 'paid' THEN now() ELSE paid_at END
  WHERE transaction_id = p_transaction_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Fonepay realtime notification trigger
CREATE OR REPLACE FUNCTION notify_fonepay_payment()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'paid' AND (OLD.status IS DISTINCT FROM 'paid') THEN
    PERFORM realtime.publish(
      'fonepay:' || NEW.transaction_id,
      'payment_confirmed',
      jsonb_build_object(
        'transaction_id', NEW.transaction_id,
        'invoice_id', NEW.invoice_id,
        'status', NEW.status,
        'gateway_reference', NEW.gateway_reference,
        'paid_amount', NEW.paid_amount,
        'paid_at', NEW.paid_at
      )
    );

    INSERT INTO system_events (event_type, entity_type, entity_id, payload)
    VALUES ('FONEPAY_PAYMENT_CONFIRMED', 'fonepay_transaction', NEW.transaction_id,
      jsonb_build_object(
        'transaction_id', NEW.transaction_id,
        'invoice_id', NEW.invoice_id,
        'status', NEW.status,
        'gateway_reference', NEW.gateway_reference
      ));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_fonepay_payment_notify ON fonepay_transactions;
CREATE TRIGGER trg_fonepay_payment_notify
  AFTER UPDATE ON fonepay_transactions
  FOR EACH ROW
  WHEN (NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid')
  EXECUTE FUNCTION notify_fonepay_payment();
