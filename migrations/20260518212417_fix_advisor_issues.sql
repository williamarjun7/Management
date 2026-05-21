-- Fix InsForge Backend Advisor issues (batch 1: 37 issues)
-- Round 1: RLS + SECURITY DEFINER functions
ALTER TABLE public.bill_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_splits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.split_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.split_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_payments FORCE ROW LEVEL SECURITY;

ALTER FUNCTION public.get_splits_for_invoice(p_invoice_id uuid) SECURITY INVOKER;
ALTER FUNCTION public.get_splits_for_invoice(p_invoice_id uuid) SET search_path = '';
ALTER FUNCTION public.test_secure() SECURITY INVOKER;
ALTER FUNCTION public.test_secure() SET search_path = '';
ALTER FUNCTION public.test_search_path() SECURITY INVOKER;
ALTER FUNCTION public.test_search_path() SET search_path = '';
ALTER FUNCTION public.test_long_body() SECURITY INVOKER;
ALTER FUNCTION public.test_long_body() SET search_path = '';
ALTER FUNCTION public.create_split_bill(p_invoice_id uuid, p_guests jsonb) SECURITY INVOKER;
ALTER FUNCTION public.create_split_bill(p_invoice_id uuid, p_guests jsonb) SET search_path = '';
ALTER FUNCTION public.create_split_bill(p_invoice_id uuid, p_order_id uuid, p_split_type text, p_guests jsonb, p_processed_by uuid) SECURITY INVOKER;
ALTER FUNCTION public.create_split_bill(p_invoice_id uuid, p_order_id uuid, p_split_type text, p_guests jsonb, p_processed_by uuid) SET search_path = '';
ALTER FUNCTION public.finalize_split(p_split_id uuid, p_processed_by uuid) SECURITY INVOKER;
ALTER FUNCTION public.finalize_split(p_split_id uuid, p_processed_by uuid) SET search_path = '';
ALTER FUNCTION public.refund_split(p_split_id uuid, p_reason text, p_processed_by uuid) SECURITY INVOKER;
ALTER FUNCTION public.refund_split(p_split_id uuid, p_reason text, p_processed_by uuid) SET search_path = '';
ALTER FUNCTION public.add_split_payment(p_split_id uuid, p_amount numeric, p_payment_method text, p_transaction_reference text, p_notes text, p_processed_by uuid, p_idempotency_key text) SECURITY INVOKER;
ALTER FUNCTION public.add_split_payment(p_split_id uuid, p_amount numeric, p_payment_method text, p_transaction_reference text, p_notes text, p_processed_by uuid, p_idempotency_key text) SET search_path = '';

-- Round 2: Replace permissive project_admin_policy with proper policies
DROP POLICY IF EXISTS project_admin_policy ON public.bill_splits;
DROP POLICY IF EXISTS project_admin_policy ON public.split_items;
DROP POLICY IF EXISTS project_admin_policy ON public.split_payments;

CREATE POLICY admin_full_access ON bill_splits FOR ALL USING (is_project_admin());
CREATE POLICY admin_full_access ON split_items FOR ALL USING (is_project_admin());
CREATE POLICY admin_full_access ON split_payments FOR ALL USING (is_project_admin());

CREATE POLICY authenticated_all ON bill_splits FOR ALL TO authenticated USING ((select auth.role()) = 'authenticated'::text) WITH CHECK ((select auth.role()) = 'authenticated'::text);
CREATE POLICY authenticated_all ON split_items FOR ALL TO authenticated USING ((select auth.role()) = 'authenticated'::text) WITH CHECK ((select auth.role()) = 'authenticated'::text);
CREATE POLICY authenticated_all ON split_payments FOR ALL TO authenticated USING ((select auth.role()) = 'authenticated'::text) WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- Round 2: Missing FK indexes (CONCURRENTLY)
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_menu_item_id ON menu_item_modifiers(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item_id ON recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_id ON recipe_versions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_version_id ON recipe_items(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_recipe_version_id ON order_items(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_invoice_id ON payment_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms(room_type_id);
CREATE INDEX IF NOT EXISTS idx_room_state_transitions_room_id ON room_state_transitions(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_room_services_booking_id ON room_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_room_services_menu_item_id ON room_services(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_room_services_room_id ON room_services(room_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_invoice_id ON bill_splits(invoice_id);
CREATE INDEX IF NOT EXISTS idx_bill_splits_order_id ON bill_splits(order_id);
CREATE INDEX IF NOT EXISTS idx_split_items_order_item_id ON split_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_split_items_split_id ON split_items(split_id);
CREATE INDEX IF NOT EXISTS idx_split_payments_split_id ON split_payments(split_id);

NOTIFY pgrst, 'reload schema';
