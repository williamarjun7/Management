-- Fix RLS on user_profiles so authenticated users can read (and insert their own) profiles.
-- The previous project_admin_policy only allows the project_admin JWT role,
-- but regular staff/kitchen/reception users need to read their own profiles
-- for the dashboard greeting, role-based routing, and auth flow.

-- Allow authenticated users to SELECT all user_profiles
-- (needed for auth context fetchUserProfile, staff directory, etc.)
DROP POLICY IF EXISTS "authenticated_read" ON public.user_profiles;
CREATE POLICY "authenticated_read" ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING ((select auth.role()) = 'authenticated'::text);

-- Allow authenticated users to INSERT their own profile row
-- (fallback when the trigger hasn't created one yet, or for invite flows)
DROP POLICY IF EXISTS "authenticated_insert_own" ON public.user_profiles;
CREATE POLICY "authenticated_insert_own" ON public.user_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- Allow authenticated users to UPDATE their own profile
-- (for profile editing in settings)
DROP POLICY IF EXISTS "authenticated_update_own" ON public.user_profiles;
CREATE POLICY "authenticated_update_own" ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
