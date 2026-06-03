ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys FORCE ROW LEVEL SECURITY;

ALTER TABLE public.fonepay_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fonepay_transactions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "block_direct_access" ON public.idempotency_keys;
CREATE POLICY "block_direct_access" ON public.idempotency_keys
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "block_direct_access" ON public.fonepay_transactions;
CREATE POLICY "block_direct_access" ON public.fonepay_transactions
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE EXECUTE ON FUNCTION public.transition_order_status(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text, uuid) TO authenticated;
ALTER FUNCTION public.transition_order_status(uuid, text, uuid) SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.transition_order_status(uuid, text, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.transition_order_status(uuid, text, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.reserve_inventory(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reserve_inventory(uuid, uuid, text) TO authenticated;
ALTER FUNCTION public.reserve_inventory(uuid, uuid, text) SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.log_fonepay_transaction(uuid, text, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.log_fonepay_transaction(uuid, text, numeric) TO authenticated;
ALTER FUNCTION public.log_fonepay_transaction(uuid, text, numeric) SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.update_fonepay_transaction(text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.update_fonepay_transaction(text, text, uuid) TO authenticated;
ALTER FUNCTION public.update_fonepay_transaction(text, text, uuid) SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.log_sync_entry(text, text, text, text, text, text, jsonb, jsonb, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_sync_entry(text, text, text, text, text, text, jsonb, jsonb, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.log_sync_entry(text, text, text, text, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.log_sync_entry(text, text, text, text, text, text, text, text, text, text, text) TO authenticated;
ALTER FUNCTION public.log_sync_entry(text, text, text, text, text, text, text, text, text, text, text) SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.queue_sync_retry(text, text, jsonb, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.queue_sync_retry(text, text, jsonb, integer, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.queue_sync_retry(text, text, text, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.queue_sync_retry(text, text, text, integer, text) TO authenticated;
ALTER FUNCTION public.queue_sync_retry(text, text, text, integer, text) SET search_path = '';

DROP POLICY IF EXISTS "authenticated_all" ON public.external_bookings;
DROP POLICY IF EXISTS "authenticated_all" ON public.room_mappings;
DROP POLICY IF EXISTS "authenticated_all" ON public.sync_logs;
DROP POLICY IF EXISTS "authenticated_all" ON public.sync_queue;

DROP POLICY IF EXISTS "block_direct_access" ON public.external_bookings;
CREATE POLICY "block_direct_access" ON public.external_bookings
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "block_direct_access" ON public.room_mappings;
CREATE POLICY "block_direct_access" ON public.room_mappings
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "block_direct_access" ON public.sync_logs;
CREATE POLICY "block_direct_access" ON public.sync_logs
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS "block_direct_access" ON public.sync_queue;
CREATE POLICY "block_direct_access" ON public.sync_queue
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_fonepay_transactions_payment_log_id
  ON public.fonepay_transactions(payment_log_id);

CREATE INDEX IF NOT EXISTS idx_sync_queue_sync_log_id
  ON public.sync_queue(sync_log_id);
