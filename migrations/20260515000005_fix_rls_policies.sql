-- ============================================================
-- MIGRATION: Add RLS policies for admin access + authenticated read
-- ============================================================
-- Adds Row-Level Security (RLS) to tables that were missing it.
-- Two policy types:
--   1. Admin full access – on all 14 tables (role = 'admin')
--   2. Authenticated read  – on pricing_rules only
-- ============================================================

-- ============================================================
-- Helper: check if current user has admin role
-- ============================================================
-- Extracted so policy definitions stay DRY.
CREATE OR REPLACE FUNCTION is_project_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- 1. room_types
-- ============================================================
ALTER TABLE room_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON room_types;
CREATE POLICY "Admin full access" ON room_types
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 2. rooms
-- ============================================================
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON rooms;
CREATE POLICY "Admin full access" ON rooms
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 3. stock_movements
-- ============================================================
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON stock_movements;
CREATE POLICY "Admin full access" ON stock_movements
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 4. system_events
-- ============================================================
ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON system_events;
CREATE POLICY "Admin full access" ON system_events
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 5. user_profiles
-- ============================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON user_profiles;
CREATE POLICY "Admin full access" ON user_profiles
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 6. audit_logs
-- ============================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON audit_logs;
CREATE POLICY "Admin full access" ON audit_logs
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 7. bookings
-- ============================================================
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON bookings;
CREATE POLICY "Admin full access" ON bookings
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 8. invoice_items
-- ============================================================
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON invoice_items;
CREATE POLICY "Admin full access" ON invoice_items
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 9. invoices
-- ============================================================
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON invoices;
CREATE POLICY "Admin full access" ON invoices
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 10. menu_categories
-- ============================================================
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON menu_categories;
CREATE POLICY "Admin full access" ON menu_categories
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 11. menu_item_modifiers
-- ============================================================
ALTER TABLE menu_item_modifiers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON menu_item_modifiers;
CREATE POLICY "Admin full access" ON menu_item_modifiers
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 12. menu_items
-- ============================================================
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON menu_items;
CREATE POLICY "Admin full access" ON menu_items
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 13. order_items
-- ============================================================
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access" ON order_items;
CREATE POLICY "Admin full access" ON order_items
  FOR ALL
  USING (is_project_admin());

-- ============================================================
-- 14. pricing_rules (admin + authenticated read)
-- ============================================================
ALTER TABLE pricing_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access" ON pricing_rules;
CREATE POLICY "Admin full access" ON pricing_rules
  FOR ALL
  USING (is_project_admin());

DROP POLICY IF EXISTS "Authenticated users can read" ON pricing_rules;
CREATE POLICY "Authenticated users can read" ON pricing_rules
  FOR SELECT
  USING (auth.role() = 'authenticated');
