-- Emergency Fix for RLS Recursion and Timeouts

-- 1. Redefine is_platform_admin with explicit search_path and ensuring SECURITY DEFINER
-- This ensures the function runs in a clean environment and bypasses RLS for the function owner (postgres)
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.platform_admin_profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Fix platform_admin_profiles RLS to avoid potential recursion
-- Drop the policy that uses is_platform_admin() which causes the loop
DROP POLICY IF EXISTS "Admins can view admin profiles" ON public.platform_admin_profiles;

-- Add a simple non-recursive policy: Users can see their own admin status
-- This allows the is_platform_admin check (if running as user) to succeed without recursion
DROP POLICY IF EXISTS "Users can view own admin profile" ON public.platform_admin_profiles;
CREATE POLICY "Users can view own admin profile" ON public.platform_admin_profiles
    FOR SELECT USING (id = auth.uid());

-- 3. Fix platform_users RLS
-- Remove the "Admins can view users" policy to break dependency on Admin checks for regular users
-- This is the CRITICAL fix for the 15s timeout
DROP POLICY IF EXISTS "Admins can view users" ON public.platform_users;

-- Ensure "Users can view own profile" is correct and active
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT USING (external_user_id = auth.uid());

-- 4. Fix platform_apps RLS
-- Ensure authenticated users can definitely read active apps (for auto-creation)
DROP POLICY IF EXISTS "Authenticated users can view active apps" ON public.platform_apps;
CREATE POLICY "Authenticated users can view active apps" ON public.platform_apps
    FOR SELECT
    TO authenticated
    USING (status = 'active');
