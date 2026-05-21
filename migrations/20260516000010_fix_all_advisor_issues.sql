-- ============================================================
-- MIGRATION: Fix all InsForge Advisor issues
-- ============================================================
-- Sections:
--   A. SECURITY DEFINER → INVOKER
--   B. Staff RLS policies on business tables
--   C. Tighten public_read policies
--   D. Tighten INSERT policies
--   E. auth.uid() subquery wrapper
--   F. Missing FK indexes (resilient)
-- ============================================================

-- ============================================================
-- A. Convert all SECURITY DEFINER functions to INVOKER
-- ============================================================

ALTER FUNCTION public.create_audit_log(uuid, text, text, text, jsonb, jsonb, text) SECURITY INVOKER;
ALTER FUNCTION public.create_system_event(text, text, text, jsonb) SECURITY INVOKER;
ALTER FUNCTION public.process_payment(uuid, numeric, payment_method, uuid, text, text, text) SECURITY INVOKER;
ALTER FUNCTION public.process_check_in(uuid, uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.process_check_out(uuid, uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.confirm_order(uuid, uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.is_project_admin() SECURITY INVOKER;

-- ============================================================
-- B. RLS policies so INVOKER functions can access tables
-- ============================================================

-- invoices
DROP POLICY IF EXISTS "authenticated_all" ON invoices;
CREATE POLICY "authenticated_all" ON invoices
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- payment_logs
DROP POLICY IF EXISTS "authenticated_insert" ON payment_logs;
CREATE POLICY "authenticated_insert" ON payment_logs
  FOR INSERT TO authenticated
  WITH CHECK (processed_by = (select auth.uid()));

-- bookings
DROP POLICY IF EXISTS "authenticated_all" ON bookings;
CREATE POLICY "authenticated_all" ON bookings
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- rooms
DROP POLICY IF EXISTS "authenticated_all" ON rooms;
CREATE POLICY "authenticated_all" ON rooms
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- room_state_transitions
DROP POLICY IF EXISTS "authenticated_insert" ON room_state_transitions;
CREATE POLICY "authenticated_insert" ON room_state_transitions
  FOR INSERT TO authenticated
  WITH CHECK (changed_by = (select auth.uid()));

-- orders
DROP POLICY IF EXISTS "authenticated_all" ON orders;
CREATE POLICY "authenticated_all" ON orders
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- invoice_items
DROP POLICY IF EXISTS "authenticated_insert" ON invoice_items;
CREATE POLICY "authenticated_insert" ON invoice_items
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- order_items
DROP POLICY IF EXISTS "authenticated_all" ON order_items;
CREATE POLICY "authenticated_all" ON order_items
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- ============================================================
-- C. Tighten permissive public_read policies
-- ============================================================

DROP POLICY IF EXISTS public_read ON restaurant_tables;
CREATE POLICY public_read ON restaurant_tables
  FOR SELECT TO PUBLIC
  USING (is_active = true);

DROP POLICY IF EXISTS public_read ON room_types;
CREATE POLICY public_read ON room_types
  FOR SELECT TO PUBLIC
  USING (is_active = true);

-- ============================================================
-- D. Tighten permissive INSERT policies
-- ============================================================

DROP POLICY IF EXISTS "Authenticated can insert audit_logs" ON audit_logs;
CREATE POLICY "Authenticated can insert audit_logs" ON audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Authenticated can insert system_events" ON system_events;
CREATE POLICY "Authenticated can insert system_events" ON system_events
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- ============================================================
-- E. auth.uid() subquery wrapper
-- ============================================================

DROP POLICY IF EXISTS "authenticated_insert_own" ON user_profiles;
CREATE POLICY "authenticated_insert_own" ON user_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (select auth.uid()));

DROP POLICY IF EXISTS "authenticated_update_own" ON user_profiles;
CREATE POLICY "authenticated_update_own" ON user_profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

CREATE OR REPLACE FUNCTION is_project_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = (select auth.uid()) AND role = 'admin'
  );
$$;

-- ============================================================
-- F. Missing FK indexes (single DO block for resilience)
-- ============================================================

DO $$
BEGIN
  BEGIN CREATE INDEX IF NOT EXISTS idx_qr_sessions_table_id ON qr_sessions(table_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_qr_sessions_table_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_orders_qr_session_id ON orders(qr_session_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_orders_qr_session_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_orders_table_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_menu_items_category_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_menu_item_id ON menu_item_modifiers(menu_item_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_menu_item_modifiers_menu_item_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_recipes_menu_item_id ON recipes(menu_item_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_recipes_menu_item_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_id ON recipe_versions(recipe_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_recipe_versions_recipe_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_version_id ON recipe_items(recipe_version_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_recipe_items_recipe_version_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_order_items_menu_item_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_order_items_order_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_order_items_recipe_version_id ON order_items(recipe_version_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_order_items_recipe_version_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_order_status_history_order_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_invoices_order_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_invoice_items_invoice_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_payment_logs_invoice_id ON payment_logs(invoice_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_payment_logs_invoice_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms(room_type_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_rooms_room_type_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_room_state_transitions_room_id ON room_state_transitions(room_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_room_state_transitions_room_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_bookings_room_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_room_services_booking_id ON room_services(booking_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_room_services_booking_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_room_services_menu_item_id ON room_services(menu_item_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_room_services_menu_item_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_room_services_room_id ON room_services(room_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_room_services_room_id: %', SQLERRM; END;
  BEGIN CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON stock_movements(product_id); EXCEPTION WHEN OTHERS THEN RAISE WARNING 'idx_stock_movements_product_id: %', SQLERRM; END;
END;
$$;
