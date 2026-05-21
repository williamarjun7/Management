-- ============================================================
-- MIGRATION: Fix security issues flagged by InsForge advisor
-- ============================================================
-- Fixes three categories:
--   1. Critical: SECURITY DEFINER functions callable by
--      authenticated users → convert to SECURITY INVOKER
--   2. Warning:  Overly permissive RLS policies (project_admin
--      policies with USING(true)) → add role check
--   3. Warning:  Overly permissive authenticated_read policy on
--      pricing_rules → add role check
-- ============================================================

-- ============================================================
-- 1. Fix SECURITY DEFINER functions → SECURITY INVOKER
-- ============================================================
-- These functions run with owner privileges and are callable
-- by authenticated users, creating privilege escalation risk.
-- Converting to SECURITY INVOKER ensures they run with the
-- caller's privileges instead.

ALTER FUNCTION public.trigger_audit_order_status() SECURITY INVOKER;
ALTER FUNCTION public.trigger_system_event_order() SECURITY INVOKER;
ALTER FUNCTION public.create_audit_log(uuid, text, text, text, jsonb, jsonb, text) SECURITY INVOKER;
ALTER FUNCTION public.create_system_event(text, text, text, jsonb) SECURITY INVOKER;
ALTER FUNCTION public.confirm_order(uuid, uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.process_payment(uuid, numeric, payment_method, uuid, text, text, text) SECURITY INVOKER;
ALTER FUNCTION public.process_check_in(uuid, uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.process_check_out(uuid, uuid, text) SECURITY INVOKER;

-- ============================================================
-- 2. Fix overly permissive project_admin_policy policies
-- ============================================================
-- These policies used USING(true) / WITH CHECK(true), granting
-- unrestricted access to any user with the project_admin role.
-- Adding explicit role check: auth.role() = 'project_admin'

-- 2a. audit_logs
DROP POLICY IF EXISTS "project_admin_policy" ON audit_logs;
CREATE POLICY "project_admin_policy" ON audit_logs
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2b. bookings
DROP POLICY IF EXISTS "project_admin_policy" ON bookings;
CREATE POLICY "project_admin_policy" ON bookings
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2c. invoice_items
DROP POLICY IF EXISTS "project_admin_policy" ON invoice_items;
CREATE POLICY "project_admin_policy" ON invoice_items
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2d. invoices
DROP POLICY IF EXISTS "project_admin_policy" ON invoices;
CREATE POLICY "project_admin_policy" ON invoices
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2e. menu_categories
DROP POLICY IF EXISTS "project_admin_policy" ON menu_categories;
CREATE POLICY "project_admin_policy" ON menu_categories
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2f. menu_item_modifiers
DROP POLICY IF EXISTS "project_admin_policy" ON menu_item_modifiers;
CREATE POLICY "project_admin_policy" ON menu_item_modifiers
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2g. menu_items
DROP POLICY IF EXISTS "project_admin_policy" ON menu_items;
CREATE POLICY "project_admin_policy" ON menu_items
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2h. order_items
DROP POLICY IF EXISTS "project_admin_policy" ON order_items;
CREATE POLICY "project_admin_policy" ON order_items
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2i. pricing_rules
DROP POLICY IF EXISTS "project_admin_policy" ON pricing_rules;
CREATE POLICY "project_admin_policy" ON pricing_rules
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2j. room_types
DROP POLICY IF EXISTS "project_admin_policy" ON room_types;
CREATE POLICY "project_admin_policy" ON room_types
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2k. rooms
DROP POLICY IF EXISTS "project_admin_policy" ON rooms;
CREATE POLICY "project_admin_policy" ON rooms
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2l. stock_movements
DROP POLICY IF EXISTS "project_admin_policy" ON stock_movements;
CREATE POLICY "project_admin_policy" ON stock_movements
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2m. system_events
DROP POLICY IF EXISTS "project_admin_policy" ON system_events;
CREATE POLICY "project_admin_policy" ON system_events
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- 2n. user_profiles
DROP POLICY IF EXISTS "project_admin_policy" ON user_profiles;
CREATE POLICY "project_admin_policy" ON user_profiles
  FOR ALL TO project_admin
  USING ((select auth.role()) = 'project_admin'::text)
  WITH CHECK ((select auth.role()) = 'project_admin'::text);

-- ============================================================
-- 3. Fix overly permissive authenticated_read on pricing_rules
-- ============================================================
-- Policy allowed unrestricted SELECT to the authenticated role.
-- Added explicit role check for defense-in-depth.

DROP POLICY IF EXISTS "authenticated_read" ON pricing_rules;
CREATE POLICY "authenticated_read" ON pricing_rules
  FOR SELECT TO authenticated
  USING ((select auth.role()) = 'authenticated'::text);
