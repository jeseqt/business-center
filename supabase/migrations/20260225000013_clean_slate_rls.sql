-- CLEAN SLATE MIGRATION
-- Purpose: Remove ALL existing RLS policies on key tables and recreate minimal, non-recursive ones
-- This is to resolve the 15s timeout issue caused by potential RLS recursion or overlapping policies.

-- ==============================================================================
-- 1. Reset platform_users Policies
-- ==============================================================================
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;

-- Drop ALL known policies (including those from previous migrations)
DROP POLICY IF EXISTS "Admins can view users" ON public.platform_users;
DROP POLICY IF EXISTS "Users can view own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.platform_users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.platform_users;
-- Also drop any other potential policies (just in case)
DROP POLICY IF EXISTS "Enable read access for all users" ON public.platform_users;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.platform_users;

-- Create SIMPLE, DIRECT policies
-- 1. View own profile (Essential for UserHome)
CREATE POLICY "Users can view own profile" ON public.platform_users
    FOR SELECT USING (external_user_id = auth.uid());

-- 2. Insert own profile (Essential for Auto-Creation)
CREATE POLICY "Users can insert own profile" ON public.platform_users
    FOR INSERT WITH CHECK (external_user_id = auth.uid());

-- 3. Update own profile (Essential for UserHome updates)
CREATE POLICY "Users can update own profile" ON public.platform_users
    FOR UPDATE USING (external_user_id = auth.uid());


-- ==============================================================================
-- 2. Reset platform_banners Policies
-- ==============================================================================
ALTER TABLE public.platform_banners ENABLE ROW LEVEL SECURITY;

-- Drop ALL known policies
DROP POLICY IF EXISTS "Admins can do everything on banners" ON public.platform_banners;
DROP POLICY IF EXISTS "Everyone can read active banners" ON public.platform_banners;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.platform_banners;

-- Create SIMPLE policies
-- 1. Public View (No Admin check to avoid recursion risk for now)
CREATE POLICY "Everyone can read active banners" ON public.platform_banners
    FOR SELECT USING (is_active = true);

-- 2. Admin Manage (Re-introduce later if needed, or use a separate admin client)
-- For now, we COMMENT OUT the admin policy to guarantee no recursion for users.
-- Admins can still view active banners via the public policy.
-- If Admins need to see inactive banners, they can use the dashboard which uses Service Role (bypassing RLS).


-- ==============================================================================
-- 3. Reset platform_admin_profiles Policies & Function
-- ==============================================================================
ALTER TABLE public.platform_admin_profiles ENABLE ROW LEVEL SECURITY;

-- Drop ALL known policies
DROP POLICY IF EXISTS "Admins can view admin profiles" ON public.platform_admin_profiles;
DROP POLICY IF EXISTS "Users can view own admin profile" ON public.platform_admin_profiles;

-- Create SIMPLE policy
-- 1. View own admin profile (Used by is_platform_admin check)
CREATE POLICY "Users can view own admin profile" ON public.platform_admin_profiles
    FOR SELECT USING (id = auth.uid());

-- Re-define is_platform_admin function to be absolutely safe
-- Use SECURITY DEFINER to run as owner (bypassing RLS), and set search_path
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean AS $$
BEGIN
  -- Direct check, no recursion possible because we are using SECURITY DEFINER
  -- and querying a table with a simple ID check (or bypassing RLS if owner is superuser)
  RETURN EXISTS (
    SELECT 1 FROM public.platform_admin_profiles
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ==============================================================================
-- 4. Reset platform_apps Policies (Just to be safe)
-- ==============================================================================
ALTER TABLE public.platform_apps ENABLE ROW LEVEL SECURITY;

-- Drop known policies
DROP POLICY IF EXISTS "Admins can view apps" ON public.platform_apps;
DROP POLICY IF EXISTS "Authenticated users can view active apps" ON public.platform_apps;

-- Create SIMPLE policies
-- 1. View active apps (Essential for UserHome/Auto-Creation)
CREATE POLICY "Authenticated users can view active apps" ON public.platform_apps
    FOR SELECT
    TO authenticated
    USING (status = 'active');
