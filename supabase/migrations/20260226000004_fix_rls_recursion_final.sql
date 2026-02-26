-- 20260226000004_fix_rls_recursion_final.sql
-- Fix RLS recursion by removing circular policy dependency on platform_admin_profiles

-- The policy "Admins can view all admin profiles" uses is_platform_admin() which queries platform_admin_profiles
-- This creates an infinite recursion loop when any table (like banners) calls is_platform_admin()
-- To fix this, we MUST remove this policy. 
-- The function is_platform_admin() only needs to check the current user's record, 
-- which is covered by "Users can view own admin profile".

-- 1. Remove recursive policy
DROP POLICY IF EXISTS "Admins can view all admin profiles" ON public.platform_admin_profiles;

-- 2. Ensure self-view policy exists (critical for is_platform_admin() to work)
DROP POLICY IF EXISTS "Users can view own admin profile" ON public.platform_admin_profiles;
CREATE POLICY "Users can view own admin profile" ON public.platform_admin_profiles
    FOR SELECT USING (auth.uid() = id);

-- 3. If admins need to view other admins, we should use a separate secure view or function
-- For now, removing the policy restores system functionality.

-- 4. Re-verify other tables to ensure they use is_platform_admin() correctly
-- No changes needed if they just call the function, as the function will now work without recursion.
