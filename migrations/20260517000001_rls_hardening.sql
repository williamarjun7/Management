-- ============================================================
-- MIGRATION: RLS Hardening — missing policies, CASCADE, UNIQUE
-- ============================================================
-- Sections:
--   A. Add RLS policies for payment_intents
--   B. Add RLS policies for recipes / recipe_versions / recipe_items
--   C. ON DELETE CASCADE on critical FK relationships
--   D. Add UNIQUE constraint on idempotency_key columns
--   E. Audit remaining SECURITY DEFINER functions
--   F. Add inventory_holds RLS + FK indexes
-- ============================================================

-- ============================================================
-- A. payment_intents RLS policies
-- ============================================================
ALTER TABLE IF EXISTS payment_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON payment_intents;
CREATE POLICY "authenticated_all" ON payment_intents
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- ============================================================
-- B. recipes / recipe_versions / recipe_items RLS policies
-- ============================================================
ALTER TABLE IF EXISTS recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recipe_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON recipes;
CREATE POLICY "authenticated_all" ON recipes
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS "authenticated_all" ON recipe_versions;
CREATE POLICY "authenticated_all" ON recipe_versions
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

DROP POLICY IF EXISTS "authenticated_all" ON recipe_items;
CREATE POLICY "authenticated_all" ON recipe_items
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

-- ============================================================
-- C. ON DELETE CASCADE on critical FK relationships
-- ============================================================

-- orders → order_items
ALTER TABLE IF EXISTS order_items
  DROP CONSTRAINT IF EXISTS order_items_order_id_fkey,
  ADD CONSTRAINT order_items_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

-- orders → invoices
ALTER TABLE IF EXISTS invoices
  DROP CONSTRAINT IF EXISTS invoices_order_id_fkey,
  ADD CONSTRAINT invoices_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- invoices → invoice_items
ALTER TABLE IF EXISTS invoice_items
  DROP CONSTRAINT IF EXISTS invoice_items_invoice_id_fkey,
  ADD CONSTRAINT invoice_items_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

-- invoices → payment_logs
ALTER TABLE IF EXISTS payment_logs
  DROP CONSTRAINT IF EXISTS payment_logs_invoice_id_fkey,
  ADD CONSTRAINT payment_logs_invoice_id_fkey
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;

-- bookings → room_services
ALTER TABLE IF EXISTS room_services
  DROP CONSTRAINT IF EXISTS room_services_booking_id_fkey,
  ADD CONSTRAINT room_services_booking_id_fkey
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE;

-- rooms → bookings
ALTER TABLE IF EXISTS bookings
  DROP CONSTRAINT IF EXISTS bookings_room_id_fkey,
  ADD CONSTRAINT bookings_room_id_fkey
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;

-- rooms → room_state_transitions
ALTER TABLE IF EXISTS room_state_transitions
  DROP CONSTRAINT IF EXISTS room_state_transitions_room_id_fkey,
  ADD CONSTRAINT room_state_transitions_room_id_fkey
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE;

-- menu_categories → menu_items
ALTER TABLE IF EXISTS menu_items
  DROP CONSTRAINT IF EXISTS menu_items_category_id_fkey,
  ADD CONSTRAINT menu_items_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES menu_categories(id) ON DELETE CASCADE;

-- menu_items → recipes
ALTER TABLE IF EXISTS recipes
  DROP CONSTRAINT IF EXISTS recipes_menu_item_id_fkey,
  ADD CONSTRAINT recipes_menu_item_id_fkey
    FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE CASCADE;

-- recipes → recipe_versions
ALTER TABLE IF EXISTS recipe_versions
  DROP CONSTRAINT IF EXISTS recipe_versions_recipe_id_fkey,
  ADD CONSTRAINT recipe_versions_recipe_id_fkey
    FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE;

-- recipe_versions → recipe_items
ALTER TABLE IF EXISTS recipe_items
  DROP CONSTRAINT IF EXISTS recipe_items_recipe_version_id_fkey,
  ADD CONSTRAINT recipe_items_recipe_version_id_fkey
    FOREIGN KEY (recipe_version_id) REFERENCES recipe_versions(id) ON DELETE CASCADE;

-- products → stock_movements
ALTER TABLE IF EXISTS stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_product_id_fkey,
  ADD CONSTRAINT stock_movements_product_id_fkey
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

-- ============================================================
-- D. UNIQUE constraint on idempotency_key columns
-- ============================================================

-- orders
DROP INDEX IF EXISTS idx_orders_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idempotency_key
  ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- invoices
DROP INDEX IF EXISTS idx_invoices_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency_key
  ON invoices(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- payment_intents
DROP INDEX IF EXISTS idx_payment_intents_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_intents_idempotency_key
  ON payment_intents(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- payment_logs
DROP INDEX IF EXISTS idx_payment_logs_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_logs_idempotency_key
  ON payment_logs(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- stock_movements
DROP INDEX IF EXISTS idx_stock_movements_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_movements_idempotency_key
  ON stock_movements(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- bookings (already has unique if not null via create_booking function, but add index)
DROP INDEX IF EXISTS idx_bookings_idempotency_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_idempotency_key
  ON bookings(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- ============================================================
-- E. Audit remaining SECURITY DEFINER functions → INVOKER
--    (only safe ones; functions that INSERT directly to audit_logs
--     / system_events via the RLS-permissive policies stay DEFINER)
-- ============================================================

-- reserve_inventory runs as INVOKER-safe because it only touches
-- inventory_holds which has authenticated_all policy
ALTER FUNCTION IF EXISTS public.reserve_inventory(uuid, uuid, text) SECURITY INVOKER;

-- release_inventory same reasoning
ALTER FUNCTION IF EXISTS public.release_inventory(uuid, text) SECURITY INVOKER;

-- record_stock_movement touches stock_movements via authenticated_all
ALTER FUNCTION IF EXISTS public.record_stock_movement(uuid, stock_movement_type, decimal, text, uuid, text, text, text, text) SECURITY INVOKER;

-- ============================================================
-- F. inventory_holds RLS + FK indexes
-- ============================================================
ALTER TABLE IF EXISTS inventory_holds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON inventory_holds;
CREATE POLICY "authenticated_all" ON inventory_holds
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated'::text)
  WITH CHECK ((select auth.role()) = 'authenticated'::text);

CREATE INDEX IF NOT EXISTS idx_inventory_holds_order_id ON inventory_holds(order_id);
CREATE INDEX IF NOT EXISTS idx_inventory_holds_product_id ON inventory_holds(product_id);

-- reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
