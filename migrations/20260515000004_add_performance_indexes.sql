-- ============================================================
-- MIGRATION: Add performance indexes for queue/replay hot paths
-- ============================================================
-- Adds composite and partial indexes identified in the DB
-- performance audit (docs/audit/db-performance-audit.md).
-- These indexes accelerate idempotency lookups, replay queries,
-- queue drain operations, and inventory hold expiration.
-- ============================================================

-- 1. Composite index for idempotency lookups (called on every payment/booking)
-- check_idempotency_strict and mark_idempotency filter by (key_hash, operation)
CREATE INDEX IF NOT EXISTS idx_idempotency_key_operation
  ON idempotency_keys(key_hash, operation);

-- 2. Composite index for replay queries (event_type + sequence_id cursor)
CREATE INDEX IF NOT EXISTS idx_system_events_type_sequence
  ON system_events(event_type, sequence_id);

-- 3. Composite index for inventory release (order_id + status)
CREATE INDEX IF NOT EXISTS idx_inventory_holds_order_status
  ON inventory_holds(order_id, status);

-- 4. Partial index for inventory hold expiration (active holds with expiry)
CREATE INDEX IF NOT EXISTS idx_inventory_holds_expires_active
  ON inventory_holds(expires_at)
  WHERE status = 'active';

-- 5. Index for invoice lookups by booking_id (process_check_out hot path)
CREATE INDEX IF NOT EXISTS idx_invoices_booking
  ON invoices(booking_id);

-- 6. Index for room availability queries (status filter)
CREATE INDEX IF NOT EXISTS idx_rooms_status
  ON rooms(status);

-- 7. Composite indexes for queue drain patterns (status + created_at)
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at);

CREATE INDEX IF NOT EXISTS idx_payment_intents_status_created
  ON payment_intents(status, created_at);

-- 8. Composite index for payment_logs invoice reconciliation (invoice_id + status)
CREATE INDEX IF NOT EXISTS idx_payment_logs_invoice_status
  ON payment_logs(invoice_id, status);

-- 9. Composite index for stock running balance calculation (product_id + created_at)
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created
  ON stock_movements(product_id, created_at);
