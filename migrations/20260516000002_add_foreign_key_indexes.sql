-- ============================================================
-- MIGRATION: Add missing FK indexes for join performance
-- ============================================================
-- FK columns used in JOINs / WHERE clauses should be indexed
-- to avoid sequential scans. This migration covers all FK
-- columns that were missing indexes.
-- ============================================================

-- ============================================================
-- user_profiles references (audit / ownership trail)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created_by ON stock_movements(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_created_by ON orders(created_by);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_order_status_history_changed_by ON order_status_history(changed_by);
CREATE INDEX IF NOT EXISTS idx_payment_logs_processed_by ON payment_logs(processed_by);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by ON invoices(created_by);
CREATE INDEX IF NOT EXISTS idx_payment_intents_created_by ON payment_intents(created_by);
CREATE INDEX IF NOT EXISTS idx_room_state_transitions_changed_by ON room_state_transitions(changed_by);
CREATE INDEX IF NOT EXISTS idx_bookings_created_by ON bookings(created_by);

-- ============================================================
-- order / order_item references (order pipeline hot paths)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_orders_table_id ON orders(table_id);
CREATE INDEX IF NOT EXISTS idx_orders_qr_session_id ON orders(qr_session_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id ON order_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_recipe_version_id ON order_items(recipe_version_id);

-- ============================================================
-- invoice / payment references
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_invoice_id ON payment_intents(invoice_id);

-- ============================================================
-- menu / recipe references
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id ON menu_items(category_id);
CREATE INDEX IF NOT EXISTS idx_menu_item_modifiers_menu_item_id ON menu_item_modifiers(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipes_menu_item_id ON recipes(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_recipe_versions_recipe_id ON recipe_versions(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_recipe_version_id ON recipe_items(recipe_version_id);
CREATE INDEX IF NOT EXISTS idx_recipe_items_product_id ON recipe_items(product_id);

-- ============================================================
-- room / booking references
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rooms_room_type_id ON rooms(room_type_id);
CREATE INDEX IF NOT EXISTS idx_room_state_transitions_room_id ON room_state_transitions(room_id);
CREATE INDEX IF NOT EXISTS idx_bookings_room_id ON bookings(room_id);
CREATE INDEX IF NOT EXISTS idx_room_services_booking_id ON room_services(booking_id);
CREATE INDEX IF NOT EXISTS idx_room_services_room_id ON room_services(room_id);
CREATE INDEX IF NOT EXISTS idx_room_services_menu_item_id ON room_services(menu_item_id);

-- ============================================================
-- inventory / qr_session references
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_inventory_holds_product_id ON inventory_holds(product_id);
CREATE INDEX IF NOT EXISTS idx_qr_sessions_table_id ON qr_sessions(table_id);
