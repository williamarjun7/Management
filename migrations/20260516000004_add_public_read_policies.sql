-- Allow public (both anon and authenticated) to read active rooms
DROP POLICY IF EXISTS public_read ON rooms;
CREATE POLICY public_read ON rooms
  FOR SELECT
  TO public
  USING (is_active = true);

-- Allow public to read all room types
DROP POLICY IF EXISTS public_read ON room_types;
CREATE POLICY public_read ON room_types
  FOR SELECT
  TO public
  USING (true);

-- Allow public to read active menu items (for QR / table menus)
DROP POLICY IF EXISTS public_read ON menu_items;
CREATE POLICY public_read ON menu_items
  FOR SELECT
  TO public
  USING (is_active = true AND is_available = true);

-- Allow public to read active menu_categories (for QR / table menus)
DROP POLICY IF EXISTS public_read ON menu_categories;
CREATE POLICY public_read ON menu_categories
  FOR SELECT
  TO public
  USING (is_active = true);

-- Allow public to read restaurant_tables (for table QR lookup)
DROP POLICY IF EXISTS public_read ON restaurant_tables;
CREATE POLICY public_read ON restaurant_tables
  FOR SELECT
  TO public
  USING (true);
