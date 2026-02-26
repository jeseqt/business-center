-- 20260226000005_nuclear_fix_rls_banners.sql
-- EMERGENCY FIX: Completely reset RLS for platform_admin_profiles and platform_banners
-- This is the "Nuclear Option" to guarantee functionality.

-- ==============================================================================
-- 1. Reset Admin Check Function
-- Ensure it is SECURITY DEFINER (runs as creator, bypassing RLS on tables)
-- AND sets search_path to prevent hijacking
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean AS $$
BEGIN
  -- Check if the user exists in the admin profiles table
  -- Because this is SECURITY DEFINER, it bypasses RLS on platform_admin_profiles
  RETURN EXISTS (
    SELECT 1 
    FROM public.platform_admin_profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 2. Reset platform_admin_profiles Policies
-- Remove ALL existing policies to eliminate recursion risk
-- ==============================================================================
ALTER TABLE public.platform_admin_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all admin profiles" ON public.platform_admin_profiles;
DROP POLICY IF EXISTS "Admins can view admin profiles" ON public.platform_admin_profiles;
DROP POLICY IF EXISTS "Users can view own admin profile" ON public.platform_admin_profiles;
DROP POLICY IF EXISTS "Anyone can view admin profiles" ON public.platform_admin_profiles;

-- Create ONLY ONE simple policy: Users can see their own profile
-- This is sufficient for the frontend to check "am I an admin?" if it queries this table directly
-- The is_platform_admin() function will bypass this anyway due to SECURITY DEFINER
CREATE POLICY "Users can view own admin profile" ON public.platform_admin_profiles
    FOR SELECT USING (auth.uid() = id);

-- ==============================================================================
-- 3. Reset platform_banners Policies
-- ==============================================================================
ALTER TABLE public.platform_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can do everything on banners" ON public.platform_banners;
DROP POLICY IF EXISTS "Admins can manage banners" ON public.platform_banners;
DROP POLICY IF EXISTS "Everyone can read active banners" ON public.platform_banners;

-- Policy 1: Admins can do everything (Create, Read, Update, Delete)
CREATE POLICY "Admins can manage banners" ON public.platform_banners
    FOR ALL
    USING (public.is_platform_admin());

-- Policy 2: Everyone (including anon) can read active banners
-- This ensures even if admin check fails, active banners are visible
CREATE POLICY "Everyone can read active banners" ON public.platform_banners
    FOR SELECT
    USING (is_active = true);

-- ==============================================================================
-- 4. Verify Admin User (Just to be safe)
-- ==============================================================================
DO $$
DECLARE
    v_target_email text := 'lambertcosine@163.com';
    v_user_id uuid;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_target_email;
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.platform_admin_profiles (id, role, display_name)
        VALUES (v_user_id, 'super_admin', v_target_email)
        ON CONFLICT (id) DO UPDATE
        SET role = 'super_admin';
    END IF;
END $$;
