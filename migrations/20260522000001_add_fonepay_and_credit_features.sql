-- Fonepay transaction log for audit trail
CREATE TABLE IF NOT EXISTS fonepay_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  transaction_id text NOT NULL UNIQUE,
  amount decimal(10,2) NOT NULL,
  qr_generated_at timestamptz DEFAULT now(),
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'expired')),
  verified_at timestamptz,
  payment_log_id uuid REFERENCES payment_logs(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fonepay_tx_invoice ON fonepay_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_fonepay_tx_status ON fonepay_transactions(status);
CREATE INDEX IF NOT EXISTS idx_fonepay_tx_tx_id ON fonepay_transactions(transaction_id);

-- RPC: Get customer credit balance from invoices
CREATE OR REPLACE FUNCTION get_customer_credit_balance(
  p_customer_name text
) RETURNS jsonb AS $$
DECLARE
  v_outstanding decimal(10,2);
  v_total_credit decimal(10,2);
BEGIN
  SELECT COALESCE(SUM(pl.amount), 0)
  INTO v_total_credit
  FROM payment_logs pl
  JOIN invoices i ON i.id = pl.invoice_id
  WHERE pl.method = 'credit_account'
    AND i.customer_name ILIKE p_customer_name
    AND pl.status = 'paid';

  SELECT COALESCE(SUM(i.total - COALESCE(paid.paid_amount, 0)), 0)
  INTO v_outstanding
  FROM invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(amount) as paid_amount
    FROM payment_logs WHERE status = 'paid'
    GROUP BY invoice_id
  ) paid ON paid.invoice_id = i.id
  WHERE i.customer_name ILIKE p_customer_name
    AND i.status IN ('unpaid', 'partial')
    AND i.total > COALESCE(paid.paid_amount, 0);

  RETURN jsonb_build_object(
    'outstanding', v_outstanding,
    'total_credit', v_total_credit
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
